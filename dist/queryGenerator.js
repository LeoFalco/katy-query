(function() {
  var QueryConfiguration, QueryGenerator, _, util,
    hasProp = {}.hasOwnProperty,
    indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  _ = require('lodash');

  util = require('util');

  QueryConfiguration = require('./queryConfiguration');

  
if (!String.prototype.endsWith) {
String.prototype.endsWith = function(searchString, position) {
var subjectString = this.toString();
if (typeof position !== 'number' || !isFinite(position) || Math.floor(position) !== position || position > subjectString.length) {
position = subjectString.length;
}
position -= searchString.length;
var lastIndex = subjectString.indexOf(searchString, position);
return lastIndex !== -1 && lastIndex === position;
};
}
;

  QueryGenerator = (function() {
    function QueryGenerator() {}


    /*
    
    {
      table: 'tasks'
      search: {
        employee_name: {
           relation: 'employee'
           column: 'name'
        }
      }
      columns: [
          { name: 'id', alias: 'this.id' }
          { name: 'description', alias: 'this.description' }
          { name: 'created_at', alias: 'this.createdAt' }
          { name: 'employee_id', alias: 'this.employee.id' }
      ]
      relations: {
        employee: {
          table: 'employees'
          sql: 'LEFT JOIN employees ON tasks.employee_id = employees.id'
          columns: [
            { name: 'name', alias: 'this.employee.name' }
          ]
        }
      }
    }
     */

    QueryGenerator.toSql = function(args) {
      var whereResult;
      whereResult = this.toWhere(args.table, args.where, args.options);
      return {
        sqlCount: (this.toSelectCount(args.table, args.relations)) + " " + whereResult.where,
        sqlSelect: (this.toSelect(args.table, args.relations)) + " " + whereResult.where + " " + (this.toOptions(args.table, args.options)),
        params: whereResult.params
      };
    };

    QueryGenerator.toSelectCount = function(table, relations) {
      var configuration, sqlText;
      if (relations == null) {
        relations = [];
      }
      configuration = QueryConfiguration.getConfiguration(table);
      if (!configuration) {
        return null;
      }
      sqlText = "SELECT COUNT(distinct " + configuration.table + ".\"id\") FROM " + configuration.table + " " + (this._toJoinSql(configuration, relations));
      return sqlText.trim();
    };

    QueryGenerator.toSelect = function(table, relations) {
      var configuration, sqlText;
      if (relations == null) {
        relations = [];
      }
      configuration = QueryConfiguration.getConfiguration(table);
      if (!configuration) {
        return null;
      }
      sqlText = "SELECT " + (this._toColumnSql(configuration, relations)) + " FROM " + configuration.table + " " + (this._toJoinSql(configuration, relations));
      return sqlText.trim();
    };

    QueryGenerator.toOptions = function(table, options) {
      var configuration, direction, limit, offset, sort, sqlText;
      configuration = QueryConfiguration.getConfiguration(table);
      if (!configuration) {
        return null;
      }
      offset = options.offset || 0;
      limit = options.limit || 25;
      sort = configuration.table + ".\"id\" ASC";
      if (options.sort) {
        direction = options.sort.indexOf('-') === 0 ? 'DESC' : 'ASC';
        options.sort = options.sort.replace('-', '');
        sort = configuration.table + ".\"" + options.sort + "\" " + direction;
      }
      sqlText = "ORDER BY " + sort + " OFFSET " + offset + " LIMIT " + limit;
      return sqlText;
    };

    QueryGenerator.toWhere = function(table, conditions, options) {
      var configuration, field, result, value;
      if (_.isEmpty(conditions) && !(options != null ? options.tenant : void 0)) {
        return {
          where: 'WHERE 1=1',
          params: []
        };
      }
      configuration = QueryConfiguration.getConfiguration(table);
      if (!configuration) {
        return null;
      }
      result = {
        where: [],
        params: []
      };
      if (options != null ? options.tenant : void 0) {
        result.where.push("(" + configuration.table + ".\"" + options.tenant.column + "\" = " + options.tenant.value + ")");
      }
      for (field in conditions) {
        if (!hasProp.call(conditions, field)) continue;
        value = conditions[field];
        if (_.isArray(value)) {
          this._whereClauseAsArray(field, value, result, configuration);
        } else if (value === null) {
          this._whereNullClause(field, value, result, configuration);
        } else {
          this._whereOperatorClause(field, value, result, configuration);
        }
      }
      result.where = "WHERE " + (result.where.join(' AND '));
      return result;
    };

    QueryGenerator._whereOperatorClause = function(field, value, result, configuration) {
      var fieldOperator;
      fieldOperator = this._getWhereOperator(field);
      result.params.push(value);
      field = field.replace(fieldOperator.operator, '');
      field = this._getFieldConfigurationOrDefault(configuration, field);
      return result.where.push(field.table + ".\"" + field.column + "\" " + fieldOperator.operator + " $" + result.params.length);
    };

    QueryGenerator._getWhereOperator = function(field) {
      var operatorHandler, operators;
      operators = {
        greaterOrEqualThanOperator: {
          operator: '>='
        },
        greaterThanOperator: {
          operator: '>'
        },
        lessOrEqualThanOperator: {
          operator: '<='
        },
        lessThanOperator: {
          operator: '<'
        },
        iLikeOperator: {
          operator: '~~*'
        },
        equalOperator: {
          operator: '='
        }
      };
      operatorHandler = (function() {
        switch (false) {
          case !field.endsWith('>='):
            return operators.greaterOrEqualThanOperator;
          case !field.endsWith('>'):
            return operators.greaterThanOperator;
          case !field.endsWith('<='):
            return operators.lessOrEqualThanOperator;
          case !field.endsWith('<'):
            return operators.lessThanOperator;
          case !field.endsWith('~~*'):
            return operators.iLikeOperator;
          default:
            return operators.equalOperator;
        }
      })();
      return operatorHandler;
    };

    QueryGenerator._whereClauseAsArray = function(field, value, result, configuration) {
      var arrValue, arrValues, i, len, withNull;
      arrValues = [];
      for (i = 0, len = value.length; i < len; i++) {
        arrValue = value[i];
        if (!(arrValue !== 'null' && arrValue !== null)) {
          continue;
        }
        result.params.push(arrValue);
        arrValues.push("$" + result.params.length);
      }
      withNull = indexOf.call(value, 'null') >= 0 || indexOf.call(value, null) >= 0;
      if (withNull) {
        return result.where.push("(" + configuration.table + ".\"" + field + "\" in (" + (arrValues.join(', ')) + ") OR " + configuration.table + ".\"" + field + "\" is null)");
      } else {
        return result.where.push(configuration.table + ".\"" + field + "\" in (" + (arrValues.join(', ')) + ")");
      }
    };

    QueryGenerator._whereNullClause = function(field, value, result, configuration) {
      var fieldConfig;
      fieldConfig = this._getFieldConfigurationOrDefault(configuration, field);
      if (value === null) {
        return result.where.push(fieldConfig.table + ".\"" + fieldConfig.column + "\" is null");
      }
    };

    QueryGenerator._getFieldConfigurationOrDefault = function(configuration, field) {
      var fieldConfiguration, searchConfig;
      fieldConfiguration = {
        table: configuration.table,
        column: field
      };
      searchConfig = configuration.search[field];
      if (searchConfig) {
        if (searchConfig.column) {
          fieldConfiguration.column = searchConfig.column;
        }
        if (searchConfig.relation) {
          if (configuration.relations[searchConfig.relation]) {
            fieldConfiguration.table = configuration.relations[searchConfig.relation].table;
          }
        }
      }
      return fieldConfiguration;
    };

    QueryGenerator._toColumnSql = function(configuration, relations) {
      var column, columns, i, j, len, len1, relation, relationColumns, relationTable;
      if (relations == null) {
        relations = [];
      }
      columns = configuration.columns.map(function(column) {
        return column.name + " \"" + column.alias + "\"";
      });
      for (i = 0, len = relations.length; i < len; i++) {
        relation = relations[i];
        if (configuration.relations[relation]) {
          relationTable = configuration.relations[relation].table;
          relationColumns = configuration.relations[relation].columns;
          for (j = 0, len1 = relationColumns.length; j < len1; j++) {
            column = relationColumns[j];
            columns.push(relationTable + "." + column.name + " \"" + column.alias + "\"");
          }
        }
      }
      return columns.join(', ');
    };

    QueryGenerator._toJoinSql = function(configuration, relations) {
      var i, joinSqlText, len, relation;
      if (relations == null) {
        relations = [];
      }
      joinSqlText = '';

      /*
        TODO: if configuration.relations[relation] is undefined
        when relation was not configured :S
       */
      if (relations) {
        for (i = 0, len = relations.length; i < len; i++) {
          relation = relations[i];
          joinSqlText += configuration.relations[relation].sql;
        }
      }
      return joinSqlText;
    };

    return QueryGenerator;

  })();

  module.exports = QueryGenerator;

}).call(this);

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInF1ZXJ5R2VuZXJhdG9yLmNvZmZlZSJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQUFBLE1BQUEsMkNBQUE7SUFBQTs7O0VBQUEsQ0FBQSxHQUFPLE9BQUEsQ0FBUSxRQUFSOztFQUNQLElBQUEsR0FBTyxPQUFBLENBQVEsTUFBUjs7RUFDUCxrQkFBQSxHQUFxQixPQUFBLENBQVEsc0JBQVI7O0VBRXJCOzs7Ozs7Ozs7Ozs7OztFQWFNOzs7O0FBRUo7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7SUE2QkEsY0FBQyxDQUFBLEtBQUQsR0FBUSxTQUFDLElBQUQ7QUFDTixVQUFBO01BQUEsV0FBQSxHQUFjLElBQUMsQ0FBQSxPQUFELENBQVMsSUFBSSxDQUFDLEtBQWQsRUFBcUIsSUFBSSxDQUFDLEtBQTFCLEVBQWlDLElBQUksQ0FBQyxPQUF0QztBQUNkLGFBQU87UUFDTCxRQUFBLEVBQVksQ0FBQyxJQUFDLENBQUEsYUFBRCxDQUFlLElBQUksQ0FBQyxLQUFwQixFQUEyQixJQUFJLENBQUMsU0FBaEMsQ0FBRCxDQUFBLEdBQTRDLEdBQTVDLEdBQStDLFdBQVcsQ0FBQyxLQURsRTtRQUVMLFNBQUEsRUFBYSxDQUFDLElBQUMsQ0FBQSxRQUFELENBQVUsSUFBSSxDQUFDLEtBQWYsRUFBc0IsSUFBSSxDQUFDLFNBQTNCLENBQUQsQ0FBQSxHQUF1QyxHQUF2QyxHQUEwQyxXQUFXLENBQUMsS0FBdEQsR0FBNEQsR0FBNUQsR0FBOEQsQ0FBQyxJQUFDLENBQUEsU0FBRCxDQUFXLElBQUksQ0FBQyxLQUFoQixFQUF1QixJQUFJLENBQUMsT0FBNUIsQ0FBRCxDQUZ0RTtRQUdMLE1BQUEsRUFBUSxXQUFXLENBQUMsTUFIZjs7SUFGRDs7SUFRUixjQUFDLENBQUEsYUFBRCxHQUFnQixTQUFDLEtBQUQsRUFBUSxTQUFSO0FBQ2QsVUFBQTs7UUFEc0IsWUFBWTs7TUFDbEMsYUFBQSxHQUFnQixrQkFBa0IsQ0FBQyxnQkFBbkIsQ0FBb0MsS0FBcEM7TUFDaEIs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QUFBLFFBQUEsQ0FBUyxDQUFDO0FBQWpELFNBQUE7O2FBQ0E7SUFUVTs7Ozs7O0VBV2QsTUFBTSxDQUFDLE9BQVAsR0FBaUI7QUE3TGpCIiwiZmlsZSI6InF1ZXJ5R2VuZXJhdG9yLmpzIiwic291cmNlUm9vdCI6Ii9zb3VyY2UvIiwic291cmNlc0NvbnRlbnQiOlsiXyAgICA9IHJlcXVpcmUgJ2xvZGFzaCdcbnV0aWwgPSByZXF1aXJlICd1dGlsJ1xuUXVlcnlDb25maWd1cmF0aW9uID0gcmVxdWlyZSAnLi9xdWVyeUNvbmZpZ3VyYXRpb24nXG5cbmBcbmlmICghU3RyaW5nLnByb3RvdHlwZS5lbmRzV2l0aCkge1xuU3RyaW5nLnByb3RvdHlwZS5lbmRzV2l0aCA9IGZ1bmN0aW9uKHNlYXJjaFN0cmluZywgcG9zaXRpb24pIHtcbnZhciBzdWJqZWN0U3RyaW5nID0gdGhpcy50b1N0cmluZygpO1xuaWYgKHR5cGVvZiBwb3NpdGlvbiAhPT0gJ251bWJlcicgfHwgIWlzRmluaXRlKHBvc2l0aW9uKSB8fCBNYXRoLmZsb29yKHBvc2l0aW9uKSAhPT0gcG9zaXRpb24gfHwgcG9zaXRpb24gPiBzdWJqZWN0U3RyaW5nLmxlbmd0aCkge1xucG9zaXRpb24gPSBzdWJqZWN0U3RyaW5nLmxlbmd0aDtcbn1cbnBvc2l0aW9uIC09IHNlYXJjaFN0cmluZy5sZW5ndGg7XG52YXIgbGFzdEluZGV4ID0gc3ViamVjdFN0cmluZy5pbmRleE9mKHNlYXJjaFN0cmluZywgcG9zaXRpb24pO1xucmV0dXJuIGxhc3RJbmRleCAhPT0gLTEgJiYgbGFzdEluZGV4ID09PSBwb3NpdGlvbjtcbn07XG59XG5gXG5jbGFzcyBRdWVyeUdlbmVyYXRvclxuXG4gICMjI1xuXG4gIHtcbiAgICB0YWJsZTogJ3Rhc2tzJ1xuICAgIHNlYXJjaDoge1xuICAgICAgZW1wbG95ZWVfbmFtZToge1xuICAgICAgICAgcmVsYXRpb246ICdlbXBsb3llZSdcbiAgICAgICAgIGNvbHVtbjogJ25hbWUnXG4gICAgICB9XG4gICAgfVxuICAgIGNvbHVtbnM6IFtcbiAgICAgICAgeyBuYW1lOiAnaWQnLCBhbGlhczogJ3RoaXMuaWQnIH1cbiAgICAgICAgeyBuYW1lOiAnZGVzY3JpcHRpb24nLCBhbGlhczogJ3RoaXMuZGVzY3JpcHRpb24nIH1cbiAgICAgICAgeyBuYW1lOiAnY3JlYXRlZF9hdCcsIGFsaWFzOiAndGhpcy5jcmVhdGVkQXQnIH1cbiAgICAgICAgeyBuYW1lOiAnZW1wbG95ZWVfaWQnLCBhbGlhczogJ3RoaXMuZW1wbG95ZWUuaWQnIH1cbiAgICBdXG4gICAgcmVsYXRpb25zOiB7XG4gICAgICBlbXBsb3llZToge1xuICAgICAgICB0YWJsZTogJ2VtcGxveWVlcydcbiAgICAgICAgc3FsOiAnTEVGVCBKT0lOIGVtcGxveWVlcyBPTiB0YXNrcy5lbXBsb3llZV9pZCA9IGVtcGxveWVlcy5pZCdcbiAgICAgICAgY29sdW1uczogW1xuICAgICAgICAgIHsgbmFtZTogJ25hbWUnLCBhbGlhczogJ3RoaXMuZW1wbG95ZWUubmFtZScgfVxuICAgICAgICBdXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgIyMjXG5cbiAgQHRvU3FsOiAoYXJncykgLT5cbiAgICB3aGVyZVJlc3VsdCA9IEB0b1doZXJlKGFyZ3MudGFibGUsIGFyZ3Mud2hlcmUsIGFyZ3Mub3B0aW9ucylcbiAgICByZXR1cm4ge1xuICAgICAgc3FsQ291bnQ6IFwiI3tAdG9TZWxlY3RDb3VudChhcmdzLnRhYmxlLCBhcmdzLnJlbGF0aW9ucyl9ICN7d2hlcmVSZXN1bHQud2hlcmV9XCJcbiAgICAgIHNxbFNlbGVjdDogXCIje0B0b1NlbGVjdChhcmdzLnRhYmxlLCBhcmdzLnJlbGF0aW9ucyl9ICN7d2hlcmVSZXN1bHQud2hlcmV9ICN7QHRvT3B0aW9ucyhhcmdzLnRhYmxlLCBhcmdzLm9wdGlvbnMpfVwiXG4gICAgICBwYXJhbXM6IHdoZXJlUmVzdWx0LnBhcmFtc1xuICAgIH1cblxuICBAdG9TZWxlY3RDb3VudDogKHRhYmxlLCByZWxhdGlvbnMgPSBbXSkgLT5cbiAgICBjb25maWd1cmF0aW9uID0gUXVlcnlDb25maWd1cmF0aW9uLmdldENvbmZpZ3VyYXRpb24odGFibGUpXG4gICAgcmV0dXJuIG51bGwgaWYgbm90IGNvbmZpZ3VyYXRpb25cblxuICAgIHNxbFRleHQgPSBcIlNFTEVDVCBDT1VOVChkaXN0aW5jdCAje2NvbmZpZ3VyYXRpb24udGFibGV9LlxcXCJpZFxcXCIpXG4gICAgICAgICAgICAgICAgIEZST00gI3tjb25maWd1cmF0aW9uLnRhYmxlfVxuICAgICAgICAgICAgICAgICAje0BfdG9Kb2luU3FsKGNvbmZpZ3VyYXRpb24sIHJlbGF0aW9ucyl9XCJcbiAgICBzcWxUZXh0LnRyaW0oKVxuXG4gIEB0b1NlbGVjdDogKHRhYmxlLCByZWxhdGlvbnMgPSBbXSkgLT5cbiAgICBjb25maWd1cmF0aW9uID0gUXVlcnlDb25maWd1cmF0aW9uLmdldENvbmZpZ3VyYXRpb24odGFibGUpXG4gICAgcmV0dXJuIG51bGwgaWYgbm90IGNvbmZpZ3VyYXRpb25cblxuICAgIHNxbFRleHQgPSBcIlNFTEVDVCAje0BfdG9Db2x1bW5TcWwoY29uZmlndXJhdGlvbiwgcmVsYXRpb25zKX1cbiAgICAgICAgICAgICAgIEZST00gI3tjb25maWd1cmF0aW9uLnRhYmxlfVxuICAgICAgICAgICAgICAgI3tAX3RvSm9pblNxbChjb25maWd1cmF0aW9uLCByZWxhdGlvbnMpfVwiXG4gICAgc3FsVGV4dC50cmltKClcblxuICBAdG9PcHRpb25zOiAodGFibGUsIG9wdGlvbnMpIC0+XG4gICAgY29uZmlndXJhdGlvbiA9IFF1ZXJ5Q29uZmlndXJhdGlvbi5nZXRDb25maWd1cmF0aW9uKHRhYmxlKVxuICAgIHJldHVybiBudWxsIGlmIG5vdCBjb25maWd1cmF0aW9uXG5cbiAgICBvZmZzZXQgPSBvcHRpb25zLm9mZnNldCBvciAwXG4gICAgbGltaXQgPSBvcHRpb25zLmxpbWl0IG9yIDI1XG5cbiAgICBzb3J0ID0gXCIje2NvbmZpZ3VyYXRpb24udGFibGV9LlxcXCJpZFxcXCIgQVNDXCJcbiAgICBpZiBvcHRpb25zLnNvcnRcbiAgICAgIGRpcmVjdGlvbiA9IGlmIG9wdGlvbnMuc29ydC5pbmRleE9mKCctJykgaXMgMCB0aGVuICdERVNDJyBlbHNlICdBU0MnXG4gICAgICBvcHRpb25zLnNvcnQgPSBvcHRpb25zLnNvcnQucmVwbGFjZSgnLScsICcnKVxuICAgICAgc29ydCA9IFwiI3tjb25maWd1cmF0aW9uLnRhYmxlfS5cXFwiI3tvcHRpb25zLnNvcnR9XFxcIiAje2RpcmVjdGlvbn1cIlxuXG4gICAgc3FsVGV4dCA9IFwiT1JERVIgQlkgI3tzb3J0fSBPRkZTRVQgI3tvZmZzZXR9IExJTUlUICN7bGltaXR9XCJcbiAgICBzcWxUZXh0XG5cblxuICBAdG9XaGVyZTogKHRhYmxlLCBjb25kaXRpb25zLCBvcHRpb25zKSAtPlxuICAgIHJldHVybiB7IHdoZXJlOiAnV0hFUkUgMT0xJywgcGFyYW1zOiBbXSB9IGlmIF8uaXNFbXB0eShjb25kaXRpb25zKSBhbmQgbm90IG9wdGlvbnM/LnRlbmFudFxuICAgIGNvbmZpZ3VyYXRpb24gPSBRdWVyeUNvbmZpZ3VyYXRpb24uZ2V0Q29uZmlndXJhdGlvbih0YWJsZSlcbiAgICByZXR1cm4gbnVsbCBpZiBub3QgY29uZmlndXJhdGlvblxuXG4gICAgcmVzdWx0ID0geyB3aGVyZTogW10sIHBhcmFtczogW10gfVxuXG4gICAgaWYgb3B0aW9ucz8udGVuYW50XG4gICAgICByZXN1bHQud2hlcmUucHVzaCBcIigje2NvbmZpZ3VyYXRpb24udGFibGV9LlxcXCIje29wdGlvbnMudGVuYW50LmNvbHVtbn1cXFwiID0gI3tvcHRpb25zLnRlbmFudC52YWx1ZX0pXCJcblxuICAgIGZvciBvd24gZmllbGQsIHZhbHVlIG9mIGNvbmRpdGlvbnNcbiAgICAgIGlmIF8uaXNBcnJheSB2YWx1ZVxuICAgICAgICBAX3doZXJlQ2xhdXNlQXNBcnJheSBmaWVsZCwgdmFsdWUsIHJlc3VsdCwgY29uZmlndXJhdGlvblxuICAgICAgZWxzZSBpZiB2YWx1ZSBpcyBudWxsXG4gICAgICAgIEBfd2hlcmVOdWxsQ2xhdXNlIGZpZWxkLCB2YWx1ZSwgcmVzdWx0LCBjb25maWd1cmF0aW9uXG4gICAgICBlbHNlXG4gICAgICAgIEBfd2hlcmVPcGVyYXRvckNsYXVzZSBmaWVsZCwgdmFsdWUsIHJlc3VsdCwgY29uZmlndXJhdGlvblxuXG4gICAgcmVzdWx0LndoZXJlID0gXCJXSEVSRSAje3Jlc3VsdC53aGVyZS5qb2luICcgQU5EICd9XCJcbiAgICByZXN1bHRcblxuICBAX3doZXJlT3BlcmF0b3JDbGF1c2U6IChmaWVsZCwgdmFsdWUsIHJlc3VsdCwgY29uZmlndXJhdGlvbikgLT5cbiAgICBmaWVsZE9wZXJhdG9yID0gQF9nZXRXaGVyZU9wZXJhdG9yIGZpZWxkXG4gICAgcmVzdWx0LnBhcmFtcy5wdXNoIHZhbHVlXG4gICAgZmllbGQgPSBmaWVsZC5yZXBsYWNlIGZpZWxkT3BlcmF0b3Iub3BlcmF0b3IsICcnXG4gICAgZmllbGQgPSBAX2dldEZpZWxkQ29uZmlndXJhdGlvbk9yRGVmYXVsdCBjb25maWd1cmF0aW9uLCBmaWVsZFxuICAgIHJlc3VsdC53aGVyZS5wdXNoIFwiI3tmaWVsZC50YWJsZX0uXFxcIiN7ZmllbGQuY29sdW1ufVxcXCIgI3tmaWVsZE9wZXJhdG9yLm9wZXJhdG9yfSAkI3tyZXN1bHQucGFyYW1zLmxlbmd0aH1cIlxuXG4gIEBfZ2V0V2hlcmVPcGVyYXRvcjogKGZpZWxkKSAtPlxuICAgIG9wZXJhdG9ycyA9IHtcbiAgICAgIGdyZWF0ZXJPckVxdWFsVGhhbk9wZXJhdG9yOiB7IG9wZXJhdG9yOiAnPj0nIH1cbiAgICAgIGdyZWF0ZXJUaGFuT3BlcmF0b3I6IHsgb3BlcmF0b3I6ICc+JyB9XG4gICAgICBsZXNzT3JFcXVhbFRoYW5PcGVyYXRvcjogeyBvcGVyYXRvcjogJzw9JyB9XG4gICAgICBsZXNzVGhhbk9wZXJhdG9yOiB7IG9wZXJhdG9yOiAnPCcgfVxuICAgICAgaUxpa2VPcGVyYXRvcjogeyBvcGVyYXRvcjogJ35+KicgfVxuICAgICAgZXF1YWxPcGVyYXRvcjogeyBvcGVyYXRvcjogJz0nIH1cbiAgICB9XG5cbiAgICBvcGVyYXRvckhhbmRsZXIgPSBzd2l0Y2hcbiAgICAgIHdoZW4gZmllbGQuZW5kc1dpdGggJz49JyB0aGVuIG9wZXJhdG9ycy5ncmVhdGVyT3JFcXVhbFRoYW5PcGVyYXRvclxuICAgICAgd2hlbiBmaWVsZC5lbmRzV2l0aCAnPicgdGhlbiBvcGVyYXRvcnMuZ3JlYXRlclRoYW5PcGVyYXRvclxuICAgICAgd2hlbiBmaWVsZC5lbmRzV2l0aCAnPD0nIHRoZW4gb3BlcmF0b3JzLmxlc3NPckVxdWFsVGhhbk9wZXJhdG9yXG4gICAgICB3aGVuIGZpZWxkLmVuZHNXaXRoICc8JyB0aGVuIG9wZXJhdG9ycy5sZXNzVGhhbk9wZXJhdG9yXG4gICAgICB3aGVuIGZpZWxkLmVuZHNXaXRoICd+fionIHRoZW4gb3BlcmF0b3JzLmlMaWtlT3BlcmF0b3JcbiAgICAgIGVsc2Ugb3BlcmF0b3JzLmVxdWFsT3BlcmF0b3JcblxuICAgIG9wZXJhdG9ySGFuZGxlclxuXG4gIEBfd2hlcmVDbGF1c2VBc0FycmF5OiAoZmllbGQsIHZhbHVlLCByZXN1bHQsIGNvbmZpZ3VyYXRpb24pIC0+XG4gICAgYXJyVmFsdWVzID0gW11cbiAgICBmb3IgYXJyVmFsdWUgaW4gdmFsdWUgd2hlbiBhcnJWYWx1ZSBub3QgaW4gWydudWxsJywgbnVsbF1cbiAgICAgIHJlc3VsdC5wYXJhbXMucHVzaCBhcnJWYWx1ZVxuICAgICAgYXJyVmFsdWVzLnB1c2ggXCIkI3tyZXN1bHQucGFyYW1zLmxlbmd0aH1cIlxuICAgIHdpdGhOdWxsID0gJ251bGwnIGluIHZhbHVlIG9yIG51bGwgaW4gdmFsdWVcbiAgICBpZiB3aXRoTnVsbFxuICAgICAgcmVzdWx0LndoZXJlLnB1c2ggXCIoI3tjb25maWd1cmF0aW9uLnRhYmxlfS5cXFwiI3tmaWVsZH1cXFwiIGluICgje2FyclZhbHVlcy5qb2luKCcsICcpfSkgT1IgI3tjb25maWd1cmF0aW9uLnRhYmxlfS5cXFwiI3tmaWVsZH1cXFwiIGlzIG51bGwpXCJcbiAgICBlbHNlXG4gICAgICByZXN1bHQud2hlcmUucHVzaCBcIiN7Y29uZmlndXJhdGlvbi50YWJsZX0uXFxcIiN7ZmllbGR9XFxcIiBpbiAoI3thcnJWYWx1ZXMuam9pbignLCAnKX0pXCJcblxuICBAX3doZXJlTnVsbENsYXVzZTogKGZpZWxkLCB2YWx1ZSwgcmVzdWx0LCBjb25maWd1cmF0aW9uKSAtPlxuICAgIGZpZWxkQ29uZmlnID0gQF9nZXRGaWVsZENvbmZpZ3VyYXRpb25PckRlZmF1bHQgY29uZmlndXJhdGlvbiwgZmllbGRcbiAgICByZXN1bHQud2hlcmUucHVzaCBcIiN7ZmllbGRDb25maWcudGFibGV9LlxcXCIje2ZpZWxkQ29uZmlnLmNvbHVtbn1cXFwiIGlzIG51bGxcIiBpZiB2YWx1ZSBpcyBudWxsXG5cbiAgQF9nZXRGaWVsZENvbmZpZ3VyYXRpb25PckRlZmF1bHQ6IChjb25maWd1cmF0aW9uLCBmaWVsZCkgLT4gIyBUT0RPIHNob3VsZCBiZSB0ZXN0ZWQgc2VwYXJhdGVseVxuXG4gICAgZmllbGRDb25maWd1cmF0aW9uID1cbiAgICAgIHRhYmxlOiBjb25maWd1cmF0aW9uLnRhYmxlXG4gICAgICBjb2x1bW46IGZpZWxkXG5cbiAgICBzZWFyY2hDb25maWcgPSBjb25maWd1cmF0aW9uLnNlYXJjaFtmaWVsZF1cbiAgICBpZiBzZWFyY2hDb25maWdcbiAgICAgIGZpZWxkQ29uZmlndXJhdGlvbi5jb2x1bW4gPSBzZWFyY2hDb25maWcuY29sdW1uIGlmIHNlYXJjaENvbmZpZy5jb2x1bW5cbiAgICAgIGlmIHNlYXJjaENvbmZpZy5yZWxhdGlvblxuICAgICAgICBpZiBjb25maWd1cmF0aW9uLnJlbGF0aW9uc1tzZWFyY2hDb25maWcucmVsYXRpb25dXG4gICAgICAgICAgZmllbGRDb25maWd1cmF0aW9uLnRhYmxlID0gY29uZmlndXJhdGlvbi5yZWxhdGlvbnNbc2VhcmNoQ29uZmlnLnJlbGF0aW9uXS50YWJsZVxuXG4gICAgZmllbGRDb25maWd1cmF0aW9uXG5cbiAgQF90b0NvbHVtblNxbDogKGNvbmZpZ3VyYXRpb24sIHJlbGF0aW9ucyA9IFtdKSAtPlxuICAgIGNvbHVtbnMgPSBjb25maWd1cmF0aW9uLmNvbHVtbnMubWFwIChjb2x1bW4pIC0+IFwiI3tjb2x1bW4ubmFtZX0gXFxcIiN7Y29sdW1uLmFsaWFzfVxcXCJcIlxuICAgIGZvciByZWxhdGlvbiBpbiByZWxhdGlvbnNcbiAgICAgIGlmIGNvbmZpZ3VyYXRpb24ucmVsYXRpb25zW3JlbGF0aW9uXVxuICAgICAgICByZWxhdGlvblRhYmxlID0gY29uZmlndXJhdGlvbi5yZWxhdGlvbnNbcmVsYXRpb25dLnRhYmxlXG4gICAgICAgIHJlbGF0aW9uQ29sdW1ucyA9IGNvbmZpZ3VyYXRpb24ucmVsYXRpb25zW3JlbGF0aW9uXS5jb2x1bW5zXG4gICAgICAgIGNvbHVtbnMucHVzaCBcIiN7cmVsYXRpb25UYWJsZX0uI3tjb2x1bW4ubmFtZX0gXFxcIiN7Y29sdW1uLmFsaWFzfVxcXCJcIiBmb3IgY29sdW1uIGluIHJlbGF0aW9uQ29sdW1uc1xuICAgIGNvbHVtbnMuam9pbiAnLCAnXG5cbiAgQF90b0pvaW5TcWw6KGNvbmZpZ3VyYXRpb24sIHJlbGF0aW9ucyA9IFtdKSAtPlxuICAgIGpvaW5TcWxUZXh0ID0gJydcblxuICAgICMjI1xuICAgICAgVE9ETzogaWYgY29uZmlndXJhdGlvbi5yZWxhdGlvbnNbcmVsYXRpb25dIGlzIHVuZGVmaW5lZFxuICAgICAgd2hlbiByZWxhdGlvbiB3YXMgbm90IGNvbmZpZ3VyZWQgOlNcbiAgICAjIyNcblxuICAgIGpvaW5TcWxUZXh0ICs9IGNvbmZpZ3VyYXRpb24ucmVsYXRpb25zW3JlbGF0aW9uXS5zcWwgZm9yIHJlbGF0aW9uIGluIHJlbGF0aW9ucyBpZiByZWxhdGlvbnNcbiAgICBqb2luU3FsVGV4dFxuXG5tb2R1bGUuZXhwb3J0cyA9IFF1ZXJ5R2VuZXJhdG9yXG4iXX0=
