'use strict';
const expect = require('chai').expect;
const _ = require('lodash');
const tmp = require('tmp');
const fs = require('fs');
const $crypt = require('../crypto');

describe('$crypt package', function() {
  const results = require('./data/crypto.json');
  // Validates a $crypt method both from text and from file
  function validateCryptMethodResult(fn, text, expectedResult) {
    expect(fn(text)).to.eql(expectedResult);
    expect(fn({string: text})).to.eql(expectedResult);
    const tmpFile = tmp.tmpNameSync();
    fs.writeFileSync(tmpFile, text, {encoding: 'binary'});
    expect(fn({file: tmpFile})).to.eql(expectedResult);
    fs.unlinkSync(tmpFile);
  }
  describe('#rand()', function() {
    it('Generates unique values', function() {
      const nValues = 5;
      const values = _.uniq(_.times(nValues, $crypt.rand));
      expect(values.length).to.eql(nValues);
    });
    it('Generates 32 char values by default', function() {
      expect($crypt.rand().length).to.eql(32);
    });
    it('Generates values with the given size', function() {
      _.each([1, 5, 10, 12, 33, 64, 1238], function(size) {
        expect($crypt.rand({size: size}).length).to.eql(size);
      });
    });
    it('Can generate ascii values', function() {
      const rand = $crypt.rand({size: 50, ascii: true});
      /* eslint-disable no-control-regex */
      expect(rand).to.match(/^[\x00-\x7F]{50}$/);
      /* eslint-enable no-control-regex */
    });
    it('Can generate alphanumeric values', function() {
      const rand = $crypt.rand({size: 50, alphanumeric: true});
      expect(rand).to.match(/^[a-z0-9]{50}$/i);
    });
    it('Can generate numeric-only strings', function() {
      const rand = $crypt.rand({size: 50, numeric: true});
      expect(rand).to.match(/^[0-9]{50}$/i);
    });
  });
  describe('Hashes from hardcoded values', function() {
    describe('Compare hashes with hardcoded values', function() {
      _.each(['md5', 'sha512', 'sha256', 'sha1'], function(alg) {
        it(`Validate ${alg}() from stored text`, function() {
          _.each(results[alg], function(hash, text) {
            validateCryptMethodResult($crypt[alg], text, hash);
          });
        });
      });
      it('Validate base64() from stored text', function() {
        _.each(results.base64, function(result, text) {
          const encoded = $crypt.base64(text);
          expect(encoded).to.eql(result);
          const decoded = $crypt.base64(encoded, 'decode');
          expect(decoded).to.eql(text);
        });
      });
    });
    describe('#hmac()', function() {
      const secretKey = results.hmac.key;
      _.each(results.hmac.data, function(data, text) {
        _.each(data, function(hash, algorithm) {
          it(`Get '${text}' hmac with ${algorithm} algorithm`, function() {
            validateCryptMethodResult(function(textToHash) {
              return $crypt.hmac(algorithm, secretKey, textToHash);
            }, text, hash);
          });
        });
      });
    });
  });
});
