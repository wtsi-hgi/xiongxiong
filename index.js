// Xiongxiong
// Bearer token generator and validator

// AGPLv3 or later
// Copyright (c) 2014, 2015 Genome Research Limited

var util   = require('util'),
    crypto = require('crypto');

module.exports = function(/* privateKey, lifetime, algorithm OR hash */) {
  var privateKey, lifetime, algorithm;

  // Parse arguments
  if (arguments.length) {
    if (arguments[0].privateKey) {
      // Hash
      privateKey = arguments[0].privateKey;
      lifetime   = parseInt(arguments[0].lifetime, 10);
      algorithm  = arguments[0].algorithm;

    } else if (typeof arguments[0] == 'string' || arguments[0] instanceof Buffer) {
      // Positional arguments
      privateKey = arguments[0];
      lifetime   = parseInt(arguments[1], 10);
      algorithm  = arguments[2];

    } else {
      // No valid arguments
      throw new TypeError('Invalid arguments');
    }
  } else {
    // Need at least a private key  
    throw new Error('No private key specified');
  }

  // Set defaults
  lifetime  = lifetime  || 3600;
  algorithm = algorithm || 'sha1';

  var getHMAC = (function() {
    // Check algorithm is supported
    if (crypto.getHashes().indexOf(algorithm) < 0) {
      throw new Error('Unsupported hash algorithm \'' + algorithm + '\'');
    }

    return function(message) {
      var hmac = crypto.createHmac(algorithm, privateKey);
      hmac.setEncoding('base64');
      hmac.end(message);
      return hmac.read();
    };
  })();

  return {
    create: function(data, callback) {
      // Flatten array
      if (util.isArray(data)) { data = data.join(':'); }

      if (typeof(data) != 'string') {
        callback(new TypeError('Seed data must be a string or array of strings'), null);

      } else {
        // Create a 48-bit salt
        crypto.randomBytes(6, function(err, salt) {
          if (err) {
            callback(err, null);
          
          } else {
            var expiration = Math.floor(Date.now() / 1000) + lifetime,
                message    = [data, expiration, salt.toString('base64')].join(':'),

                // Generate HMAC of data:expiration:salt
                password   = getHMAC(message);
            
            // Return token and basic authentication pair
            callback(null, {
              expiration:    expiration,  // Unix epoch
              accessToken:   (new Buffer([message, password].join(':'))).toString('base64'),
              basicLogin:    (new Buffer(message)).toString('base64'),
              basicPassword: password
            });
          }
        });
      }
    },

    extract: function(/* bearer/basic auth data */) {
      var output = {isValid: false};

      switch (arguments.length) {
        case 1:
          // Split bearer token and extract as basic auth
          var accessToken = (new Buffer(arguments[0], 'base64')).toString().split(':');

          var basicPassword = accessToken.pop(),
              basicLogin    = (new Buffer(accessToken.join(':'))).toString('base64');

          output = this.extract(basicLogin, basicPassword);

          break;

        case 2:
          // Basic authentication data
          var basicLogin    = (new Buffer(arguments[0], 'base64')).toString(),
              extracted     = basicLogin.split(':'),
              basicPassword = arguments[1];

          // We don't want the salt
          extracted.pop();

          output = {
            // Expiration is penultimate element
            // n.b., JavaScript Date in ms, hence x1000 on Unix epoch
            expiration: new Date(parseInt(extracted.pop(), 10) * 1000),

            // Convert to string if we only have one element remaining
            data: extracted.length == 1 ? extracted[0] : extracted
          };

          if (Date.now() > output.expiration) {
            // Expired
            output.isValid = false;

          } else {
            // Generate HMAC of basicLogin to check against
            var hmac = getHMAC(basicLogin);
            output.isValid = (basicPassword == hmac);
          }

          break;

        default:
          break;
      }

      return output;
    }
  };
};
