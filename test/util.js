/* eslint-disable no-unused-expressions */
'use strict';
const chai = require('chai');
const chaiFs = require('chai-fs');
const expect = chai.expect;
const _ = require('lodash');
const fs = require('fs-extra');
const path = require('path');
const utilPkg = require('../util');
const fnWrapping = require('../lib/function-wrapping.js');
const Sandbox = require('nami-test/lib/sandbox');

chai.use(chaiFs);

_.each({
  '$util package non-contextified': false,
  '$util package contextified': true
}, function(shouldContextify, suiteTitle) {
  let $util = null;
  if (!shouldContextify) {
    $util = utilPkg;
  }
  describe(suiteTitle, function() {
    let s = null;
    afterEach(function() {
      s.cleanup();
    });
    beforeEach(function() {
      s = new Sandbox();
      if (shouldContextify) {
        $util = utilPkg.contextify({
          wrapper: new fnWrapping.FileNormalizerWrapper(s.root, {logger: null}),
          logger: null
        });
      }
    });
    describe('#sleep()', function() {
      this.timeout(5000);
      function measure(fn) {
        const start = process.hrtime();
        fn();
        const diff = process.hrtime(start);
        // time in milliseconds
        return (diff[0] * 1e9 + diff[1]) / 1e6;
      }
      _.each({
        'Sleeps a int number of seconds': 2,
        'Sleeps a float number of seconds': 1.5
      }, function(time, title) {
        it(title, function() {
          const milliseconds = measure(function() { $util.sleep(time); });
          const expectedMs = time * 1000;
          // We have to take into account the time it takes to call sleep
          const marginMs = expectedMs * 0.1;
          expect(milliseconds).to.be.above(expectedMs).and.below(expectedMs + marginMs);
        });
      });
      it('Reports an error on malformed time specification', function() {
        expect(function() {
          $util.sleep('asdf');
        }).to.throw(`invalid time interval 'asdf'`);
      });
    });
    describe('#tail()', function() {
      const sampleText = _.range(20).join('\n');
      let file = null;
      // The default lines returned by tail
      const defaultMaxLines = 10;
      beforeEach(function() {
        const fullFile = s.write('sample.txt', sampleText);
        if (shouldContextify) {
          file = 'sample.txt';
        } else {
          file = fullFile;
        }
      });
      function checkLinesRange(text, maxLines) {
        const opts = {};
        if (!_.isUndefined(maxLines)) {
          opts.lines = maxLines;
        } else {
          maxLines = defaultMaxLines;
        }
        const lines = text.split('\n');
        const textTail = $util.tail(file, opts);
        expect(textTail).to.be.eql(lines.slice(Math.max(lines.length - maxLines, 0)).join('\n'));
        return textTail;
      }
      it('Returns the last 10 lines of a file by default', function() {
        const tail = checkLinesRange(sampleText);
        expect(tail.split('\n').length).to.be.eql(10);
      });
      it('Allows configuring the number of lines to return', function() {
        const maxLines = 15;
        const tail = checkLinesRange(sampleText, maxLines);
        expect(tail.split('\n').length).to.be.eql(maxLines);
      });
      it('Providing more lines than the total amount of lines retrieves the full text', function() {
        const maxLines = sampleText.split('\n').length * 10;
        const tail = checkLinesRange(sampleText, maxLines);
        expect(tail).to.be.eql(sampleText);
      });
      it('Providing negative or invalid line number returns the default max lines', function() {
        const lines = sampleText.split('\n');
        const expectedTail = lines.slice(lines.length - defaultMaxLines).join('\n');
        _.each(['foobar', Infinity, NaN, -1, null], function(maxLines) {
          const tail = $util.tail(file, {lines: maxLines});
          expect(tail).to.be.eql(expectedTail);
        });
      });
      it('Allows providing an offset', function() {
        const offset = sampleText.search('15\n');
        const expectedTail = sampleText.slice(offset);
        const tail = $util.tail(file, {lines: 15, offset: offset});
        expect(tail).to.be.eql(expectedTail);
      });
      it('Returns empty when tailing a non-existent file or a non-file', function() {
        const dir = s.mkdir('a/b/c/d');
        const f = path.join(dir, 'sample.log');
        expect($util.tail(f)).to.be.eql('');
        expect($util.tail(dir)).to.be.eql('');
      });
      it('Allows following by lines', function(done) {
        const readLines = [];
        const lines = sampleText.split('\n');
        const expectedTail = lines.slice(lines.length - defaultMaxLines).join('\n');
        const watcher = $util.tail(file, {callback: line => readLines.push(line), follow: true});
        expect(readLines.join('\n')).to.be.eql(expectedTail);
        const newData = 'some\nnew\ndata';
        const fd = fs.openSync(s.normalize(file), 'a');
        fs.writeSync(fd, `${newData}\n`);
        fs.closeSync(fd);
        setTimeout(function() {
          expect(readLines.join('\n')).to.be.eql(`${expectedTail}\n${newData}`);
          watcher.unwatch();
          done();
        }, 200);
      });
      it('Allows providing a callback', function() {
        const lines = [];
        const maxLines = sampleText.split('\n').length * 10;
        const tail = $util.tail(file, {lines: maxLines, callback: line => lines.push(line)});
        expect(tail).to.be.eql(sampleText);
        expect(lines.join('\n')).to.be.eql(sampleText);
      });
    });
  });
  describe('#retryWhile()', function() {
    it('Fails if not passing a function', function() {
      _.each([1, 'text', {}, [], true], function(func) {
        expect(function() {
          $util.retryWhile(func);
        }).to.throw(TypeError);
      });
      expect($util.retryWhile(function() {
        return false;
      })).to.be.eql(true);
    });
    it('Fails if step is not a finite number', function() {
      _.each(['sometext', {}, Infinity], function(value) {
        expect(function() {
          $util.retryWhile(function() {return false;}, {step: value});
        }).to.throw(TypeError);
      });
      expect($util.retryWhile(function() {
        return false;
      }, {step: 1})).to.be.eql(true);
    });
    it('Fails if timeout is not a finite number or Infinity', function() {
      _.each(['sometext', {}], function(value) {
        expect(function() {
          $util.retryWhile(function() {return false;}, {timeout: value});
        }).to.throw(TypeError);
      });
      _.each([1, Infinity], function(value) {
        expect($util.retryWhile(function() {return false;}, {timeout: value})).to.be.eql(true);
      });
    });
    it('Returns false if timeout', function() {
      expect($util.retryWhile(function() {
        return true;
      }, {step: 0.1, timeout: 0.3})).to.be.eql(false);
    });
    it('Returns true if expected result on time', function() {
      const deadline = new Date().getTime() + 500;
      expect($util.retryWhile(function() {
        if (new Date().getTime() <= deadline) {
          return true;
        } else {
          return false;
        }
      }, {step: 0.1, timeout: 3})).to.be.eql(true);
    });
  });
});
