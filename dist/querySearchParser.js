(function() {
  var QuerySearchParser, _, searchQuery,
    hasProp = {}.hasOwnProperty;

  searchQuery = require('search-query-parser');

  _ = require('lodash');

  QuerySearchParser = (function() {
    function QuerySearchParser() {}

    QuerySearchParser.parse = function(syntaxSearch, config) {
      var key, parseResult, value;
      parseResult = searchQuery.parse(syntaxSearch, this._toOptions(config));
      delete parseResult.text;
      for (key in parseResult) {
        if (!hasProp.call(parseResult, key)) continue;
        value = parseResult[key];
        if (_.isString(value)) {
          parseResult[key] = value.replace(/\*/g, '%');
        }
      }
      return parseResult;
    };

    QuerySearchParser._toOptions = function(config) {
      var key, options, value;
      options = {
        keywords: (function() {
          var ref, results;
          ref = config.search;
          results = [];
          for (key in ref) {
            if (!hasProp.call(ref, key)) continue;
            value = ref[key];
            results.push(key);
          }
          return results;
        })()
      };
      return options;
    };

    return QuerySearchParser;

  })();

  module.exports = QuerySearchParser;

}).call(this);