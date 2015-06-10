'use strict';
const expect = require('chai').expect;
const delegate = require('../lib/delegation');
const _ = require('lodash');

describe('Delegation', function() {
  describe('#delegate()', function() {
    class Delegator {
      constructor() {
        this.name = 'delegator';
      }
      whoami() { return this.name; }
      foo() { return 'foo from Delegator'; }
    }
    class Delegated {
      constructor() {
        this.attr1 = 'value1';
        this.attr2 = 'value2';
        this.name = 'delegated';
      }
      foo() { return 'bar'; }
      hello(who, from) { return `Hello to ${who} from ${from}`; }
      whoami() { return this.name; }
    }
    let delegator = null;
    let delegated = null;
    beforeEach(function defineObjects() {
      delegator = new Delegator();
      delegated = new Delegated();
    });
    it('Delegation of existing methods work', function() {
      expect(delegator.foo()).to.eql('foo from Delegator');
      delegate(delegator, ['foo'], delegated);
      expect(delegator.foo()).to.eql('bar');
    });
    it('Delegation properly sets the context (this)', function() {
      expect(delegator.whoami()).to.eql('delegator');
      delegate(delegator, ['whoami'], delegated);
      expect(delegator.whoami()).to.eql('delegated');
    });
    it('Delegation of attributes work', function() {
      expect(delegator.whoami()).to.eql('delegator');
      delegate(delegator, ['name'], delegated);
      expect(delegator.whoami()).to.eql('delegated');
    });
    it('Delegation of methods preserve arguments', function() {
      expect(delegator.hello).to.eql(undefined);
      delegate(delegator, ['hello'], delegated);
      expect(delegator.hello('you', 'me')).to.eql('Hello to you from me');
    });
    it('Delegate one attribute as string', function() {
      expect(delegator.whoami()).to.eql('delegator');
      delegate(delegator, 'whoami', delegated);
      expect(delegator.whoami()).to.eql('delegated');
    });
    it('Delegate hash of attributes', function() {
      const map = {
        newFoo: 'foo', newWhoami: 'whoami',
        newHello: 'hello', attr1: 'attr2',
        attr2: 'attr1', newName: 'name'
      };
      _.each(map, function(value, key) {
        expect(delegator[key]).to.eql(undefined);
      });

      delegate(delegator, map, delegated);
      _.each(map, function(value, key) {
        if (_.isFunction(delegated[value])) {
          expect(delegator[key]()).to.eql(delegated[value]());
        } else {
          expect(delegator[key]).to.eql(delegated[value]);
        }
      });
    });
    it('Delegate with output filter', function() {
      const uppercaseString = function(str) { return str.toUpperCase(); };
      // Make sure the filter works
      expect(uppercaseString('foo')).to.eql('FOO');

      expect(delegator.whoami()).to.eql('delegator');
      delegate(delegator, ['name'], delegated, {outputFilter: uppercaseString});
      expect(delegator.whoami()).to.eql('DELEGATED');
      delegate(delegator, ['hello'], delegated, {outputFilter: uppercaseString});
      expect(delegator.hello('you', 'me')).to.eql(uppercaseString(delegated.hello('you', 'me')));
    });

    // For now, we only inherit the enumerable property
    it('Delegated attributes inherit enumerable property', function() {
      const properties = {
        a: {
          enumerable: true,
          writable: true
        },
        b: {
          enumerable: false,
          writable: true
        },
        c: {
          enumerable: false,
          writable: false
        }
      };

      Object.defineProperties(delegated, properties);

      delegate(delegator, ['a', 'b', 'c'], delegated);
      _.each(properties, function(definition, property) {
        expect(delegated.propertyIsEnumerable(property)).to.eql(delegator.propertyIsEnumerable(property));
      });
    });
  });
});
