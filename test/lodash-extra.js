'use strict';
const expect = require('chai').expect;
const _ = require('lodash');
const $ld = require('../lodash-extra.js').safe();

function validateIs(fn, trues, falses) {
  _.each(trues, e => expect(fn(e)).to.be.eql(true));
  _.each(falses, e => expect(fn(e)).to.be.eql(false));
}
describe('Lodash Extra', function() {
  describe('Safe methods', function() {
    it('#isArray()', function() {
      /* eslint-disable no-array-constructor */
      validateIs(
        $ld.isArray,
        [[], new Array()],
        [{}, 'sample', {'0': 1, 'length': 1}, /./]
      );
      /* eslint-enable no-array-constructor */
    });
    it('#isSymbol()', function() {
      validateIs(
        $ld.isSymbol,
        [Symbol.iterator],
        [1, 'asdf', function() { return true; }, /./, null]
      );
    });
    it('#isBoolean()', function() {
      validateIs(
        $ld.isBoolean,
        [true, false, Boolean(true), Boolean(false), Boolean()],
        [1, 'asdf', function() { return true; }, /./]
      );
    });
    it('#isNumber()', function() {
      // Yes, NaN is a number
      validateIs(
        $ld.isNumber,
        [3, -1, Number.MIN_VALUE, 2.1, Infinity, NaN],
        ['3', null]
      );
    });
    it('#isUndefined()', function() {
      // Yes, NaN is a number
      validateIs(
        $ld.isUndefined,
        [undefined, void(0)],
        [3, -1, Number.MIN_VALUE, 2.1, Infinity, NaN]
      );
    });
    it('#isObject()', function() {
      validateIs(
        $ld.isObject,
        [{}, [1, 2, 3], function() {}, /x/],
        ['1', 2, NaN, null]
      );
    });
    it('#isPlainObject()', function() {
      /* eslint-disable no-new-object */
      validateIs(
        $ld.isPlainObject,
        [{}, new Object(), new Object({})],
        ['1', new Object(1), new Object('test'), new Object(/x/), /x/, 2, NaN, null, [1, 2, 3], function() {}]
      );
      /* eslint-enable no-new-object */
    });

    it('#isFinite()', function() {
      validateIs(
        $ld.isFinite,
        [3, Number.MIN_VALUE],
        ['3', Infinity, null, undefined, NaN]
      );
    });
    it('#isNaN()', function() {
      validateIs(
        $ld.isNaN,
        [Number(NaN), NaN],
        ['3', Infinity, null, undefined]
      );
    });
    it('#noop()', function() {
      expect($ld.noop).to.not.throw();
    });
    it('#xor()', function() {
      expect($ld.xor([2, 1], [2, 3])).to.be.eql([1, 3]);
    });
    it('#take()', function() {
      expect($ld.take([1, 2, 3])).to.be.eql([1]);
      expect($ld.take([1, 2, 3], 2)).to.be.eql([1, 2]);
      expect($ld.take([1, 2, 3], 5)).to.be.eql([1, 2, 3]);
      expect($ld.take([1, 2, 3], 0)).to.be.eql([]);
    });
    it('#takeRight()', function() {
      expect($ld.takeRight([1, 2, 3])).to.be.eql([3]);
      expect($ld.takeRight([1, 2, 3], 2)).to.be.eql([2, 3]);
      expect($ld.takeRight([1, 2, 3], 5)).to.be.eql([1, 2, 3]);
      expect($ld.takeRight([1, 2, 3], 0)).to.be.eql([]);
    });
    it('#isNull()', function() {
      validateIs(
        $ld.isNull,
        [null],
        ['3', Infinity, NaN, undefined]
      );
    });
    it('#isInteger()', function() {
      validateIs(
        $ld.isInteger,
        [3, -100],
        ['3', 2.1, NaN, null, Infinity, Number.MIN_VALUE]
      );
    });

    it('#isRegExp()', function() {
      validateIs(
        $ld.isRegExp,
        [/x/, new RegExp('x')],
        ['/x/']
      );
    });
    it('#isString()', function() {
      validateIs(
        $ld.isString,
        ['a', `b`, String('c')],
        [1, null, function() {}, /x/]
      );
    });
    it('#isError()', function() {
      validateIs(
        $ld.isError,
        [new Error()],
        [Error, 1, 'foo', null, {message: 'foo', name: 'bar'}]
      );
    });
    it('#isFunction()', function() {
      validateIs(
        $ld.isFunction,
        [() => {}],
        [/x/]
      );
    });
    it('#values()', function() {
      expect($ld.values(['a', 'b', 'c'])).to.be.eql(['a', 'b', 'c']);
      expect($ld.values('hi')).to.be.eql(['h', 'i']);
      expect($ld.values({a: 'b', c: 'd'})).to.be.eql(['b', 'd']);
    });
    it('#keys()', function() {
      expect($ld.keys('hi')).to.be.eql(['0', '1']);
      expect($ld.keys({a: 'b', c: 'd'})).to.be.eql(['a', 'c']);
      expect($ld.keys(['a', 'b', 'c'])).to.be.eql(['0', '1', '2']);
    });
    it('#compact()', function() {
      expect($ld.compact([0, 1, false, 2, '', 3])).to.be.eql([1, 2, 3]);
    });
    it('#assign()', function() {
      function Foo() { this.c = 3; }
      function Bar() { this.e = 5; }
      Foo.prototype.d = 4;
      Bar.prototype.f = 6;
      expect($ld.assign({'a': 1}, new Foo, new Bar)).to.be.eql(
        {'a': 1, 'c': 3, 'e': 5}
      );
    });
    it('#first()', function() {
      expect($ld.first([1, 2, 3])).to.be.eql(1);
      expect($ld.first([])).to.be.eql(undefined);
    });
    it('#last()', function() {
      expect($ld.last([1, 2, 3])).to.be.eql(3);
      expect($ld.last([])).to.be.eql(undefined);
    });
    it('#capitalize()', function() {
      expect($ld.capitalize('FRED')).to.be.eql('Fred');
    });
    it('#difference()', function() {
      expect($ld.difference([2, 1], [2, 3])).to.be.eql([1]);
      expect($ld.difference([2, 1], [1, 2])).to.be.eql([]);
    });
    it('#once()', function() {
      let count = 0;
      function incr() { count++; }
      const fn = $ld.once(incr);
      expect(count).to.be.eql(0);
      fn();
      expect(count).to.be.eql(1);
      fn();
      fn();
      expect(count).to.be.eql(1);
      incr();
      expect(count).to.be.eql(2);
    });
    it('#includes()', function() {
      expect($ld.includes([1, 2, 3], 1)).to.be.eql(true);
      expect($ld.includes([1, 2, 3], 1, 2)).to.be.eql(false);
      expect($ld.includes({'user': 'fred', 'age': 40}, 'fred')).to.be.eql(true);
      expect($ld.includes('pebbles', 'eb')).to.be.eql(true);
    });
    it('#omit()', function() {
      expect($ld.omit(
        {'a': 1, 'b': '2', 'c': 3},
        ['a', 'c']
      )).to.be.eql({'b': '2'});
    });
    it('#union()', function() {
      expect($ld.union([2], [1, 2])).to.be.eql([2, 1]);
    });
    it('#toArray()', function() {
      expect($ld.toArray({'a': 1, 'b': 2})).to.be.eql([1, 2]);
      expect($ld.toArray('abc')).to.be.eql(['a', 'b', 'c']);
      expect($ld.toArray(1)).to.be.eql([]);
      expect($ld.toArray(null)).to.be.eql([]);
    });
    it('#uniq()', function() {
      expect($ld.uniq([2, 1, 2])).to.be.eql([2, 1]);
    });
    it('#uniqBy()', function() {
      expect($ld.uniqBy([2.1, 1.2, 2.3], Math.floor)).to.be.eql([2.1, 1.2]);
    });
    it('#any()', function() {
      expect($ld.any([null, 0, 'yes', false], Boolean)).to.be.eql(true);
      expect($ld.any([null, 0, '', false], Boolean)).to.be.eql(false);
    });

    it('#identity()', function() {
      _.each(
        [1, 'x', /x/, NaN, Infinity, null, function() {}, {a: 1}, [1, 2, 3]],
        e => expect($ld.identity(e)).to.be.eql(e)
      );
    });
    it('#startsWith()', function() {
      expect($ld.startsWith('abc', 'a')).to.be.eql(true);
      expect($ld.startsWith('abc', 'b')).to.be.eql(false);
      expect($ld.startsWith('abc', 'b', 1)).to.be.eql(true);
    });
    it('#endsWith()', function() {
      expect($ld.endsWith('abc', 'c')).to.be.eql(true);
      expect($ld.endsWith('abc', 'b')).to.be.eql(false);
      expect($ld.endsWith('abc', 'b', 2)).to.be.eql(true);
    });
    it('#trimStart()', function() {
      const expected = 'abc  ';
      expect($ld.trimStart(expected)).to.be.eql(expected);
      expect($ld.trimStart(` ${expected}`)).to.be.eql(expected);
      expect($ld.trimStart(`   ${expected}`)).to.be.eql(expected);
      expect($ld.trimStart(`\n \n ${expected}`)).to.be.eql(expected);
    });
    it('#trimEnd()', function() {
      const expected = '  abc';
      expect($ld.trimEnd(expected)).to.be.eql(expected);
      expect($ld.trimEnd(`${expected} `)).to.be.eql(expected);
      expect($ld.trimEnd(`${expected}   `)).to.be.eql(expected);
      expect($ld.trimEnd(`${expected}\n \n `)).to.be.eql(expected);
    });
  });
});
