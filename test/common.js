'use strict';
const expect = require('chai').expect;
const Common = require('../lib/common');

describe('Common', function() {
  describe('#getInheritanceChain()', function() {
    it('returns an empty array for objects, functions and undefined values', function() {
      expect(Common.getInheritanceChain()).to.have.length(0);
      expect(Common.getInheritanceChain({})).to.have.length(0);
      expect(Common.getInheritanceChain(function() {})).to.have.length(0);
      expect(Common.getInheritanceChain(undefined)).to.have.length(0);
      expect(Common.getInheritanceChain(null)).to.have.length(0);
    });

    it('correctly returns the inheritance chain for an object', function() {
      class Chain {}
      class Inheritance extends Chain {}
      class My extends Inheritance {}
      expect(Common.getInheritanceChain(My)).to.eql(['Inheritance', 'Chain']);
    });
  });
});
