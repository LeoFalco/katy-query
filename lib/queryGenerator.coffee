_    = require 'lodash'
util = require 'util'

`
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
`
class QueryGenerator

  @toSql: (args, config) ->

    whereResult = @_toWhere(args.where, config, args.options)
    relations = _.uniq(whereResult.relations.concat(args.relations || []))
    joins = @_toJoinSql(relations, config)
    columns = @_toColumnSql(relations, config)
    options = @_toOptions(args.options, config)

    return {

      sqlCount: "SELECT
                  COUNT(distinct #{config.table}.\"id\")
                 FROM #{config.table} 
                  #{joins}
                 WHERE #{whereResult.where};"

      sqlSelect: "SELECT
                   #{columns}
                  FROM #{config.table}
                   #{joins}
                  WHERE #{config.table}.\"id\" IN (
                    SELECT DISTINCT #{config.table}.\"id\"
                    FROM #{config.table}
                      #{joins}
                    WHERE #{whereResult.where}
                  )
                  #{options};"

      params: whereResult.params
      relations: relations
    }

  @_toOptions: (options, config) ->

    if options.sort
      sort = "#{config.table}.\"id\" ASC"
      direction = if options.sort.indexOf('-') is 0 then 'DESC' else 'ASC'
      field = options.sort.replace('-', '')
      fieldConfig = @_getFieldConfigurationOrDefault config, field
      sort = "#{fieldConfig.table}.\"#{fieldConfig.column}\" #{direction}"

    sqlText = ''
    sqlText += "ORDER BY #{sort} " if sort

    if options.limit or options.offset
      sqlText += "OFFSET #{options.offset || 0} "
      sqlText += "LIMIT #{options.limit || 10}"

    sqlText = sqlText.trim()

  @_toWhere: (conditions, config, options) ->

    if _.isEmpty(conditions) and not options?.tenant
      return { where: '1=1', params: [], relations: [] }

    result = { where: [], params: [], relations: [] }

    if options?.tenant
      if _.isArray options.tenant.value
        tenantValues = []
        for tenantValue in options.tenant.value
          result.params.push tenantValue
          tenantValues.push "$#{result.params.length}"
        result.where.push "(#{config.table}.\"#{options.tenant.column}\" in (#{tenantValues.join(', ')}))"
      else
        result.params.push options.tenant.value
        result.where.push "(#{config.table}.\"#{options.tenant.column}\" = $#{result.params.length})"

    for own field, value of conditions
      if _.isArray value
        @_whereClauseAsArray field, value, result, config
      else if value is null or value is 'null'
        @_whereNullClause field, value, result, config
      else
        @_whereOperatorClause field, value, result, config

    result.where = "#{result.where.join ' AND '}"
    result.relations = _.uniq(result.relations)
    result

  @_whereOperatorClause: (field, value, result, configuration) ->
    fieldOperator = @_getWhereOperator field
    field = field.replace fieldOperator.operator, ''
    fieldConfig = @_getFieldConfigurationOrDefault configuration, field, result
    result.params.push fieldConfig.mapper(value)
    columnName = "#{fieldConfig.table}.\"#{fieldConfig.column}\""
    columnName = fieldConfig.format.replace('{{column}}', columnName) if fieldConfig.format
    result.where.push "#{columnName} #{fieldOperator.operator} $#{result.params.length}"

  @_getWhereOperator: (field) ->
    operators = {
      greaterOrEqualThanOperator: { operator: '>=' }
      greaterThanOperator: { operator: '>' }
      lessOrEqualThanOperator: { operator: '<=' }
      lessThanOperator: { operator: '<' }
      iLikeOperator: { operator: '~~*' }
      equalOperator: { operator: '=' }
    }

    operatorHandler = switch
      when field.endsWith '>=' then operators.greaterOrEqualThanOperator
      when field.endsWith '>' then operators.greaterThanOperator
      when field.endsWith '<=' then operators.lessOrEqualThanOperator
      when field.endsWith '<' then operators.lessThanOperator
      when field.endsWith '~~*' then operators.iLikeOperator
      else operators.equalOperator

    operatorHandler

  @_whereClauseAsArray: (field, value, result, configuration) ->
    arrValues = []
    fieldConfig = @_getFieldConfigurationOrDefault configuration, field, result
    for arrValue in value when arrValue not in ['null', null]
      result.params.push fieldConfig.mapper(arrValue)
      arrValues.push "$#{result.params.length}"
    withNull = 'null' in value or null in value
    if withNull
      result.where.push "(#{fieldConfig.table}.\"#{fieldConfig.column}\" in (#{arrValues.join(', ')}) OR #{fieldConfig.table}.\"#{fieldConfig.column}\" is null)"
    else
      result.where.push "#{fieldConfig.table}.\"#{fieldConfig.column}\" in (#{arrValues.join(', ')})"

  @_whereNullClause: (field, value, result, configuration) ->
    fieldConfig = @_getFieldConfigurationOrDefault configuration, field, result
    if value is null or value is 'null'
      result.where.push "#{fieldConfig.table}.\"#{fieldConfig.column}\" is null"

  @_getFieldConfigurationOrDefault: (config, field, result) -> # TODO should be tested separately
    fieldConfiguration =
      table: config.table
      column: field
      mapper: (value) -> value

    searchConfig = config.search[field]
    if searchConfig
      fieldConfiguration.column = searchConfig.column if searchConfig.column
      fieldConfiguration.format = searchConfig.format if searchConfig.format

      if searchConfig.mapper
        mapper = config.mappers[searchConfig.mapper]
        if mapper
          fieldConfiguration.mapper = mapper
        else
          console.log "### WARNING: mapper #{searchConfig.mapper} not found, it will be ignored."

      if searchConfig.relation and config.relations[searchConfig.relation]
        result.relations.push searchConfig.relation if result
        fieldConfiguration.table = config.relations[searchConfig.relation].table

    fieldConfiguration

  @_toColumnSql: (relations = [], configuration) ->
    columns = configuration.columns.map (column) -> "#{column.table || configuration.table}.\"#{column.name}\" \"#{column.alias}\""

    @_getRelationRequiredChain configuration, relations, (relation) ->
      columns.push "#{column.table || relation.table}.\"#{column.name}\" \"#{column.alias}\"" for column in relation.columns

    _.uniq(columns).join ', '

  @_toJoinSql:(relations = [], configuration) ->
    return '' if relations.length <= 0
    joins = []
    @_getRelationRequiredChain configuration, relations, (relation) -> joins.push relation.sql
    _.uniq(joins).join ' '

  @_getRelationRequiredChain: (configuration, relations, callback) ->
    for relationName in relations
      relation = configuration.relations[relationName]
      if relation
        @_getRelationRequiredChain(configuration, relation.requires, callback) if relation.requires
        callback relation

module.exports = QueryGenerator
