/* eslint-disable no-unused-expressions */
'use strict';
const chai = require('chai');
const chaiFs = require('chai-fs');
const expect = chai.expect;
const _ = require('lodash');
const execSync = require('child_process').execSync;
const fs = require('fs-extra');
const os = require('os');
const filePkg = require('../file');
const path = require('path');
const Sandbox = require('nami-test/lib/sandbox');
const generateRandomData = require('nami-test/lib/utils').generateRandomData;
const fnWrapping = require('../lib/function-wrapping.js');
chai.use(chaiFs);

let noRootIt = null;
if (process.getuid() !== 0) {
  noRootIt = it;
} else {
  noRootIt = xit;
}

function normalizePermissions(perm) {
  const pad = '0'.repeat(4 - perm.length);
  return pad + perm;
}

function getFilePermissions(file) {
  return normalizePermissions((fs.lstatSync(file).mode & parseInt('777', 8)).toString(8));
}

function getCurrentDate() {
  // The mtime attribute units are seconds but now() returns milliseconds, we need to truncate
  // that extra milliseconds to 0 adding some random seconds to avoid executing it in the same time
  return (Math.floor(_.now() / 1000) + _.random(1, 1000)) * 1000;
}


describe('$file pkg', function() {
  function verifyBinaryData(read, expected) {
    // Compare base64 to avoid printing a binary to console if the test fails
    expect(new Buffer(read).toString('base64')).to.be.eql(new Buffer(expected).toString('base64'));
  }
  _.each({
    '$file package non-contextified': false,
    '$file package contextified': true
  }, function(shouldContextify, suiteTitle) {
    let $file = null;
    let ctxIt = null;
    if (shouldContextify) {
      ctxIt = it;
    } else {
      $file = filePkg;
      ctxIt = _.noop;
    }
    describe(suiteTitle, function() {
      let s = null;
      afterEach(function() {
        s.cleanup();
      });
      beforeEach(function() {
        s = new Sandbox();
        if (shouldContextify) {
          $file = filePkg.contextify({
            wrapper: new fnWrapping.FileNormalizerWrapper(s.root, {logger: null}),
            logger: null
          });
        }
      });
      describe('#link()', function() {
        it('Creates link to absolute paths', function() {
          const targetFile = s.write('target.txt', 'FOO');
          const link = s.normalize('link');
          $file.link(targetFile, link);
          expect(link).to.be.a.symlink();
          expect(fs.readlinkSync(link)).to.be.eql(targetFile);
          expect(link).to.have.content('FOO');
        });
        it('Creates link to relative paths', function() {
          const targetName = 'target2.txt';
          s.write(targetName, 'FOO');
          s.mkdir('sample');
          const link = s.normalize('sample/link');
          $file.link(`../${targetName}`, link);
          expect(link).to.be.a.symlink();
          expect(fs.readlinkSync(link)).to.be.eql(`../${targetName}`);
          expect(link).to.have.content('FOO');
        });
        it('Creates broken links to absolute paths', function() {
          const link = s.normalize('link');
          const target = s.normalize('target.txt');
          $file.link(target, link);
          expect(link).to.be.a.symlink();
          expect(fs.readlinkSync(link)).to.be.eql(target);
        });
        it('Creates broken links to relative paths', function() {
          const link = s.normalize('link');
          $file.link('../target.txt', link);
          expect(link).to.be.a.symlink();
          expect(fs.readlinkSync(link)).to.be.eql('../target.txt');
        });
      });
      describe('#delete()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            sample_dir: {
              'file.txt': 'SAMPLE',
              'empty_dir': {},
              'other_dir': {
                'a': {'b': {'c': {}, 'foo.txt': 'FOO', 'bar.png': 'BAR'}}
              }
            }
          });
        });
        it('Deletes individual files', function() {
          const testFile = s.write('test.txt', 'SAMPLE');
          expect(testFile).to.be.a.path();
          $file.delete(testFile);
          expect(testFile).to.not.be.a.path();
        });
        it('Deletes directories', function() {
          expect(s.normalize('sample_dir')).to.be.a.directory();
          $file.delete(s.normalize('sample_dir'));
          expect(s.normalize('sample_dir')).to.not.be.a.path();
        });
        it('Do not delete directories if told not to', function() {
          expect(s.normalize('sample_dir')).to.be.a.directory();
          $file.delete(s.normalize('sample_dir'), {deleteDirs: false});
          expect(s.normalize('sample_dir')).to.be.a.directory();
        });
        it('Do not delete non-empty directories if told not to', function() {
          expect(s.normalize('sample_dir/other_dir')).to.be.a.directory();
          expect(s.normalize('sample_dir/empty_dir')).to.be.a.directory();

          $file.delete(s.normalize('sample_dir/other_dir'), {onlyEmptyDirs: true});
          expect(s.normalize('sample_dir/other_dir')).to.be.a.directory();

          $file.delete(s.normalize('sample_dir/empty_dir'), {onlyEmptyDirs: true});
          expect(s.normalize('sample_dir/empty_dir')).to.not.be.a.path();
        });
        it('Returns true when the path was deleted and false otherwise', function() {
          let result = $file.delete(s.normalize('sample_dir/other_dir'), {onlyEmptyDirs: true});
          expect(s.normalize('sample_dir/other_dir')).to.be.a.directory();
          expect(result).to.be.false;
          result = $file.delete(s.normalize('sample_dir/empty_dir'), {onlyEmptyDirs: true});
          expect(s.normalize('sample_dir/empty_dir')).to.not.be.a.path();
          expect(result).to.be.true;
        });
        it('Supports providing a list', function() {
          const dir = s.normalize('sample_dir/other_dir/a/b');
          const files = _.map(['c', 'foo.txt', 'bar.png'], function(f) {
            return path.join(dir, f);
          });
          let contents = fs.readdirSync(dir);
          expect(contents).to.not.be.eql([]);
          $file.delete(files);
          expect(dir).to.be.a.directory();
          contents = fs.readdirSync(dir);
          expect(contents).to.eql([]);
        });
        it('Supports providing patterns', function() {
          const dir = s.normalize('sample_dir/other_dir/a/b');
          const pattern = `${dir}/*`;
          let contents = fs.readdirSync(dir);
          expect(contents).to.not.be.eql([]);
          $file.delete(pattern);
          expect(dir).to.be.a.directory();
          contents = fs.readdirSync(dir);
          expect(contents).to.eql([]);
        });
        it('Allows deleting files with literal regexp-like characters', function() {
          const basename = 'r+e.gex[c]a(r)s*.txt';
          const destDir = s.mkdir('new_destination_dir');
          const f = s.write(path.join(destDir, basename), '');
          expect(path.join(destDir, basename)).to.be.a.path();
          $file.delete(f);
          expect(path.join(destDir, basename)).to.not.be.a.path();
        });
        it('When providing multiple patterns, only returns true if all were deleted', function() {
          let result = $file.delete(
            [s.normalize('sample_dir/other_dir'), s.normalize('sample_dir/empty_dir')],
            {onlyEmptyDirs: true}
          );
          expect(s.normalize('sample_dir/other_dir')).to.be.a.directory();
          expect(s.normalize('sample_dir/empty_dir')).to.not.be.a.path();
          expect(result).to.be.false;

          result = $file.delete([s.normalize('sample_dir/other_dir'), s.normalize('file.txt')]);
          expect(s.normalize('sample_dir/other_dir')).to.not.be.a.path();
          expect(s.normalize('file.txt')).to.not.be.a.path();
          expect(result).to.be.true;
        });
        ctxIt('It resolves relative paths', function() {
          const basename = 'sample.txt';
          const file = s.write(basename, '');
          $file.delete(basename);
          expect(file).to.not.be.a.path();
        });
      });

      describe('#read()', function() {
        // We are generating a big chunck of random data, depending on the size may surpass the default timeout
        this.timeout(5000);
        let randomData = null;
        const basename = 'sample.dat';
        let testFile = null;
        beforeEach(function() {
          randomData = generateRandomData();
          testFile = s.write(basename, randomData, {encoding: 'binary'});
        });
        it('Reads files', function() {
          const readData = $file.read(testFile, {encoding: 'binary'});
          verifyBinaryData(readData, randomData);
        });
        ctxIt('It resolves relative paths', function() {
          const readData = $file.read(basename, {encoding: 'binary'});
          verifyBinaryData(readData, randomData);
        });
      });

      describe('#write()', function() {
        // We are generating a big chunck of random data, depending on the size may surpass the default timeout
        this.timeout(5000);
        _.each({
          'Writes files': 'sample.dat',
          'Write file under non-existent dir': 'a/b/c/sample.dat'
        }, function(f, title) {
          function performWriteTest(basename, writerFn) {
            const testFile = s.normalize(basename);
            const randomData = generateRandomData();
            writerFn(testFile, randomData, {encoding: 'binary'});

            const readData = s.read(basename, {encoding: 'binary'});
            verifyBinaryData(readData, randomData);
          }
          it(title, function() {
            performWriteTest(f, $file.write);
          });
          ctxIt(`${title} with relative paths `, function() {
            performWriteTest(f, function(fullPath, data, options) {
              // We ignore the full path as we are testing the contextfied relative paths resolution
              return $file.write(f, data, options);
            });
          });
        });
      });
      describe('#substitute()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            sample_dir: {
              'file.txt': 'Some text... @@TARGET_STRING@@ ...the end',
              'empty_dir': {},
              'other_dir': {
                'a': {
                  'b': {
                    'c': {}, 'file_to_ignore.txt': 'DONT REMOVE THIS @@TARGET_STRING@@',
                    'file_to_substitute.txt': 'REPLACE @@TARGET_STRING@@'
                  }
                }
              }
            }
          });
        });
        ctxIt('Resolves relative paths', function() {
          const basename = 'sample_dir/file.txt';
          $file.substitute(basename, '@@TARGET_STRING@@', '##SUBSTITUTED_STRING##');
          const expected = 'Some text... ##SUBSTITUTED_STRING## ...the end';
          expect(s.normalize(basename)).to.have.content(expected);
        });
        it('Substitutes exact patterns, 1st way', function() {
          const testFile = s.normalize('sample_dir/file.txt');
          $file.substitute(testFile, '@@TARGET_STRING@@', '##SUBSTITUTED_STRING##');
          const readData = s.read(testFile);
          const expected = 'Some text... ##SUBSTITUTED_STRING## ...the end';
          expect(expected).to.be.eql(readData);
        });
        it('Substitutes exact patterns, 2nd way', function() {
          const testFile = s.normalize('sample_dir/file.txt');
          $file.substitute(testFile, {'@@TARGET_STRING@@': '##SUBSTITUTED_STRING##'});
          const readData = s.read(testFile);
          const expected = 'Some text... ##SUBSTITUTED_STRING## ...the end';
          expect(expected).to.be.eql(readData);
        });
        it('Substitutes exact patterns, 3rd way', function() {
          const testFile = s.normalize('sample_dir/file.txt');
          $file.substitute(testFile, [{pattern: '@@TARGET_STRING@@', value: '##SUBSTITUTED_STRING##'}]);
          const readData = s.read(testFile);
          const expected = 'Some text... ##SUBSTITUTED_STRING## ...the end';
          expect(expected).to.be.eql(readData);
        });
        it('Substitutes exact patterns with global matching, 1st way', function() {
          const testFile = s.normalize('sample_dir/file.txt');
          $file.substitute(testFile, '...', '###');
          const readData = s.read(testFile);
          const expected = 'Some text### @@TARGET_STRING@@ ###the end';
          expect(expected).to.be.eql(readData);
        });
        it('Substitutes exact patterns with global matching, 2nd way', function() {
          const testFile = s.normalize('sample_dir/file.txt');
          $file.substitute(testFile, {'...': '###'});
          const readData = s.read(testFile);
          const expected = 'Some text### @@TARGET_STRING@@ ###the end';
          expect(expected).to.be.eql(readData);
        });
        it('Substitutes exact patterns with global matching, 3rd way', function() {
          const testFile = s.normalize('sample_dir/file.txt');
          $file.substitute(testFile, [{pattern: '...', value: '###'}]);
          const readData = s.read(testFile);
          const expected = 'Some text### @@TARGET_STRING@@ ###the end';
          expect(expected).to.be.eql(readData);
        });
        it('Substitutes exact patterns recursively, 1st way', function() {
          const testDir = s.normalize('sample_dir');
          $file.substitute(testDir, '@@TARGET_STRING@@', '##SUBSTITUTED_STRING##', {recursive: true});
          let testFile = s.normalize(`${testDir}/file.txt`);
          let readData = s.read(testFile);
          let expected = 'Some text... ##SUBSTITUTED_STRING## ...the end';
          expect(expected).to.be.eql(readData);
          // Inner file
          testFile = s.normalize(`${testDir}/other_dir/a/b/file_to_substitute.txt`);
          readData = s.read(testFile);
          expected = 'REPLACE ##SUBSTITUTED_STRING##';
          expect(expected).to.be.eql(readData);
        });
        it('Substitutes exact patterns recursively, 2nd way', function() {
          const testDir = s.normalize('sample_dir');
          $file.substitute(testDir, {'@@TARGET_STRING@@': '##SUBSTITUTED_STRING##'}, {recursive: true});
          let testFile = s.normalize(`${testDir}/file.txt`);
          let readData = s.read(testFile);
          let expected = 'Some text... ##SUBSTITUTED_STRING## ...the end';
          expect(expected).to.be.eql(readData);
          // Inner file
          testFile = s.normalize(`${testDir}/other_dir/a/b/file_to_substitute.txt`);
          readData = s.read(testFile);
          expected = 'REPLACE ##SUBSTITUTED_STRING##';
          expect(expected).to.be.eql(readData);
        });
        it('Substitutes exact patterns recursively, 3rd way', function() {
          const testDir = s.normalize('sample_dir');
          $file.substitute(
            testDir,
            [{pattern: '@@TARGET_STRING@@', value: '##SUBSTITUTED_STRING##'}],
            {recursive: true}
          );
          let testFile = s.normalize(`${testDir}/file.txt`);
          let readData = s.read(testFile);
          let expected = 'Some text... ##SUBSTITUTED_STRING## ...the end';
          expect(expected).to.be.eql(readData);
          // Inner file
          testFile = s.normalize(`${testDir}/other_dir/a/b/file_to_substitute.txt`);
          readData = s.read(testFile);
          expected = 'REPLACE ##SUBSTITUTED_STRING##';
          expect(expected).to.be.eql(readData);
        });
        it('Substitutes regexp patterns, 1st way', function() {
          const testFile = s.normalize('sample_dir/file.txt');
          $file.substitute(testFile, /^(.*)@@[^@]*@@(.*)$/, '$1##SUBSTITUTED_STRING##$2');
          const readData = s.read(testFile);
          const expected = 'Some text... ##SUBSTITUTED_STRING## ...the end';
          expect(expected).to.be.eql(readData);
        });
        it('Substitutes regexp patterns, 3rd way', function() {
          const testFile = s.normalize('sample_dir/file.txt');
          $file.substitute(testFile, [{pattern: /^(.*)@@[^@]*@@(.*)$/, value: '$1##SUBSTITUTED_STRING##$2'}]);
          const readData = s.read(testFile);
          const expected = 'Some text... ##SUBSTITUTED_STRING## ...the end';
          expect(expected).to.be.eql(readData);
        });
        it('Substitutes regexp patterns recursively, 1st way', function() {
          const testDir = s.normalize('sample_dir');
          $file.substitute(testDir, /^(.*)@@[^@]*@@(.*)$/, '$1##SUBSTITUTED_STRING##$2', {recursive: true});
          let testFile = s.normalize(`${testDir}/file.txt`);
          let readData = s.read(testFile);
          let expected = 'Some text... ##SUBSTITUTED_STRING## ...the end';
          expect(expected).to.be.eql(readData);
          // Inner file
          testFile = s.normalize(`${testDir}/other_dir/a/b/file_to_substitute.txt`);
          readData = s.read(testFile);
          expected = 'REPLACE ##SUBSTITUTED_STRING##';
          expect(expected).to.be.eql(readData);
        });
        it('Substitutes regexp patterns recursively, 3rd way', function() {
          const testDir = s.normalize('sample_dir');
          $file.substitute(
            testDir,
            [{pattern: /^(.*)@@[^@]*@@(.*)$/, value: '$1##SUBSTITUTED_STRING##$2'}],
            {recursive: true}
          );
          let testFile = s.normalize(`${testDir}/file.txt`);
          let readData = s.read(testFile);
          let expected = 'Some text... ##SUBSTITUTED_STRING## ...the end';
          expect(expected).to.be.eql(readData);
          // Inner file
          testFile = s.normalize(`${testDir}/other_dir/a/b/file_to_substitute.txt`);
          readData = s.read(testFile);
          expected = 'REPLACE ##SUBSTITUTED_STRING##';
          expect(expected).to.be.eql(readData);
        });
        it('Only follows symlinks in a directory if followSymLinks is true', function() {
          const dir = s.normalize('sample_dir/other_dir');
          const file = s.normalize('sample_dir/file.txt');
          const link = s.normalize(path.join(dir, 'linktofile'));
          $file.link(file, link);

          $file.substitute(dir, '@@TARGET_STRING@@', '##SUBSTITUTED_STRING##', {recursive: true});
          expect('Some text... @@TARGET_STRING@@ ...the end').to.be.eql(s.read(link));

          $file.substitute(dir, '@@TARGET_STRING@@', '##SUBSTITUTED_STRING##', {recursive: true, followSymLinks: true});
          expect('Some text... ##SUBSTITUTED_STRING## ...the end').to.be.eql(s.read(file));
        });
        it('Allows excluding files from the substitutions', function() {
          s.createFilesFromManifest({
            exlusion_test: {
              'file1.txt': '@@TARGET_STRING@@',
              'file2.txt': '@@TARGET_STRING@@',
              'file3.txt': '@@TARGET_STRING@@'
            }
          });
          const testDir = s.normalize('exlusion_test');
          $file.substitute(testDir, '@@TARGET_STRING@@', 'NEW_TEXT', {recursive: true, exclude: ['**/file2.txt']});
          _.each(['file1.txt', 'file3.txt'], function(f) {
            const data = s.read(path.join('exlusion_test', f));
            expect(data).to.be.eql('NEW_TEXT');
          });
          const excludedFileData = s.read(path.join('exlusion_test', 'file2.txt'));
          expect(excludedFileData).to.be.eql('@@TARGET_STRING@@');
        });
        describe("Supports configuring the 'global' attribute", function() {
          const tests = [
            {
              type: 'regexp',
              text: 'a\na\na\na',
              result: 'b\nb\nb\nb',
              global: true,
              substitution: 'b',
              pattern: 'a'
            },
            {
              type: 'regexp',
              text: 'a\na\na\na',
              result: 'b\na\na\na',
              global: false,
              substitution: 'b',
              pattern: 'a'
            }
          ];
          it('$file.substitute(file, pattern, value) form', function() {
            _.each(tests, function(test) {
              const file = s.write('sample.txt', test.text);
              $file.substitute(file, test.pattern, test.substitution, {global: test.global, type: test.type});
              expect(file).to.have.content(test.result);
            });
          });
          it('$file.substitute(file, {a: b}) form', function() {
            _.each(tests, function(test) {
              // This form do not support regexps
              if (_.isRegExp(test.pattern)) {
                return;
              }
              const file = s.write('sample.txt', test.text);
              const substitutions = {};
              substitutions[test.pattern] = test.substitution;
              $file.substitute(file, substitutions, {global: test.global, type: test.type});
              expect(file).to.have.content(test.result);
            });
          });
          it('$file.substitute(file, [{pattern: a, value: b}]) form', function() {
            _.each(tests, function(test) {
              const file = s.write('sample.txt', test.text);
              const substitution = {pattern: test.pattern, value: test.substitution};
              $file.substitute(file, [substitution], {global: test.global, type: test.type});
              expect(file).to.have.content(test.result);
            });
          });
        });
        it('Raises an error when wrong syntax is used', function() {
          const testFile = s.normalize('sample_dir/file.txt');
          expect(function() {
            $file.substitute(testFile, [{patterns: /^(.*)@@[^@]*@@(.*)$/, value: '$1##SUBSTITUTED_STRING##$2'}]);
          }).to.throw.exception;
          expect(function() {
            $file.substitute(testFile, [{pattern: /^(.*)@@[^@]*@@(.*)$/}]);
          }).to.throw.exception;
          expect(function() {
            $file.substitute(testFile, /^(.*)@@[^@]*@@(.*)$/);
          }).to.throw.exception;
        });
      });

      describe('#relativize()', function() {
        it('Relativizes a path within a given prefix', function() {
          const testFile = s.normalize('sample_dir/a/b/c/file.txt');
          expect($file.relativize(testFile, s.normalize('/'))).to.be.eql('sample_dir/a/b/c/file.txt');
          expect($file.relativize(testFile, s.normalize('sample_dir'))).to.be.eql('a/b/c/file.txt');
          expect($file.relativize(testFile, s.normalize('sample_dir/a'))).to.be.eql('b/c/file.txt');
          expect($file.relativize(testFile, s.normalize('sample_dir/a/b'))).to.be.eql('c/file.txt');
          expect($file.relativize(testFile, s.normalize('sample_dir/a/b/c'))).to.be.eql('file.txt');
        });
      });

      describe('#sanitize()', function() {
        it('Sanitizes a path, converting it into an unix-like path', function() {
          const testFile = `${s.normalize('sample_dir/a/b')}/../c\\file.txt`;
          // TODO Is this the expected? The initial / is being removed
          expect($file.sanitize(testFile, {noupdir: false})).to.be.eql(s.normalize('sample_dir/a/c/file.txt'));
        });
      });

      describe('#listDir()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            sample_dir: {
              'a.txt': 'foo',
              'b': {},
              'c': {
                'd': 'bar'
              }
            }
          });
        });
        it('Lists the directory content as Unix\'s `find` would do', function() {
          const testDir = s.normalize('sample_dir');
          const expected = _.map(['a.txt', 'b', 'c', 'c/d'], function(item) {
            return `${testDir}/${item}`;
          });
          expect($file.listDir(testDir)).to.be.eql(expected);
        });
        it('Lists the directory content, removing the prefix', function() {
          const testDir = s.normalize('sample_dir');
          const expected = ['a.txt', 'b', 'c', 'c/d'];
          expect($file.listDir(testDir, {stripPrefix: true})).to.be.eql(expected);
        });
      });

      describe('#glob()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            sample_dir: {
              'file1.txt': '',
              'file2.txt': '',
              'file3.xml': '',
              'dir1': {},
              'dir2': {
                'file4.txt': 'bar'
              }
            }
          });
        });
        it('Lists the directory content matching a glob-like pattern', function() {
          const testDir = s.normalize('sample_dir');
          const pattern = '*.txt';
          const expected = _.map(['file1', 'file2'], function(item) {
            return `${testDir}/${item}.txt`;
          });
          expect($file.glob(`${testDir}/${pattern}`)).to.be.eql(expected);
        });
        it('Allows excluding files from the results', function() {
          const testDir = s.normalize('sample_dir');
          const pattern = '*.txt';
          const expected = [path.join(testDir, 'file2.txt')];
          expect($file.glob(`${testDir}/${pattern}`, {exclude: ['**/file1.txt']})).to.be.eql(expected);
        });

        it('Lists the directory content matching a glob-like pattern, changing the working directory', function() {
          const testDir = s.normalize('sample_dir');
          const pattern = '*.xml';
          const expected = ['file3.xml'];
          expect($file.glob(pattern, {cwd: testDir})).to.be.eql(expected);
        });
        it('Lists the directory content matching multiple glob-like patterns', function() {
          const testDir = s.normalize('sample_dir');
          const patterns = ['*.xml', '*/*.txt'];
          const expected = ['file3.xml', 'dir2/file4.txt'];
          expect($file.glob(patterns, {cwd: testDir})).to.be.eql(expected);
        });
      });

      describe('#append()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            'file.txt': 'First line.'
          });
        });
        it('Appends text to existing files', function() {
          const testFile = s.normalize('file.txt');
          let readData = s.read(testFile);
          const addition = 'Second line.\nThird!';
          $file.append(testFile, addition);
          const expected = `${readData}${addition}`;
          readData = s.read(testFile);
          expect(readData).to.be.eql(expected);
        });
        it('Appends text to existing files, with newline', function() {
          const testFile = s.normalize('file.txt');
          let readData = s.read(testFile);
          const addition = ' End of the line.\nSecond!';
          $file.append(testFile, addition, {atNewLine: true});
          const expected = `${readData}\n${addition}`;
          readData = s.read(testFile);
          expect(readData).to.be.eql(expected);
        });
        it('Appends text to non-existing files', function() {
          let testFile = s.normalize('non-existing.txt');
          const addition = 'Some text';
          expect(testFile).not.to.be.a.path();
          $file.append(testFile, addition);
          expect(testFile).to.be.a.path();
          expect(testFile).to.have.content(addition);

          testFile = s.normalize('non-existing2.txt');
          $file.append(testFile, addition, {atNewLine: true});
          expect(testFile).to.have.content(addition);
        });
      });
      describe('#prepend()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            'file.txt': 'First line.'
          });
        });
        it('Prepends text to existing files', function() {
          const testFile = s.normalize('file.txt');
          let readData = s.read(testFile);
          const addition = 'Second line.\nThird!';
          $file.prepend(testFile, addition);
          const expected = `${addition}${readData}`;
          readData = s.read(testFile);
          expect(readData).to.be.eql(expected);
        });
        it('Prepends text to non-existing files', function() {
          const testFile = s.normalize('non-existing.txt');
          const addition = 'Some text';
          expect(testFile).not.to.be.a.path();
          $file.prepend(testFile, addition);
          expect(testFile).to.be.a.path();
          expect(testFile).to.have.content(addition);
        });
      });
      describe('#puts()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            'file.txt': 'First line.'
          });
        });
        it('Appends text to existing files with trailing newline', function() {
          const testFile = s.normalize('file.txt');
          let readData = s.read(testFile);
          const addition = 'Second line.\nThird!';
          $file.puts(testFile, addition);
          const expected = `${readData}${addition}\n`;
          readData = s.read(testFile);
          expect(readData).to.be.eql(expected);
        });
        it('Appends text to existing files, with newline before and after', function() {
          const testFile = s.normalize('file.txt');
          let readData = s.read(testFile);
          const addition = 'At new line.\nSecond!';
          $file.puts(testFile, addition, {atNewLine: true});
          const expected = `${readData}\n${addition}\n`;
          readData = s.read(testFile);
          expect(readData).to.be.eql(expected);
        });
        it('Appends text to non-existing files with trailing newline', function() {
          let testFile = s.normalize('non-existing.txt');
          const addition = 'Some text';
          expect(testFile).not.to.be.a.path();
          $file.puts(testFile, addition);
          const expected = `${addition}\n`;
          const readData = s.read(testFile);
          expect(testFile).to.be.a.path();
          expect(readData).to.be.eql(expected);

          testFile = s.normalize('non-existing2.txt');
          $file.puts(testFile, addition, {atNewLine: true});
          expect(testFile).to.be.a.path();
          expect(readData).to.be.eql(expected);
        });
      });

      describe('#stripPath()', function() {
        it('Returns the path removing "n" parent path elements.', function() {
          const testDir = 'sample_dir/a/b/c/foo.txt';
          expect($file.stripPath(testDir, 0)).to.be.eql('sample_dir/a/b/c/foo.txt');
          expect($file.stripPath(testDir, 2)).to.be.eql('b/c/foo.txt');
          expect($file.stripPath(testDir, 4)).to.be.eql('foo.txt');
          expect($file.stripPath('/foo/bar/file', 1, 'end')).to.be.eql('/foo/bar');
        });
      });

      describe('#walkDir()', function() {
        let createdFiles = null;
        beforeEach(function() {
          createdFiles = s.createFilesFromManifest({
            sample_dir: {
              'a.txt': 'foo',
              'b': {},
              'c': {
                'd': 'bar'
              }
            }
          });
        });
        it('Navigate through directory contents', function() {
          const testDir = s.normalize('sample_dir');
          const fileList = [];
          $file.walkDir(testDir, function(file) {
            fileList.push(file);
          });
          expect(fileList.sort()).to.be.eql(createdFiles.sort());
        });
        it('Allows early-aborting listing contents', function() {
          const fileList = [];
          $file.walkDir(s.normalize('sample_dir'), function(file) {
            fileList.push(file);
          });
          expect(fileList.length).to.be.eql(createdFiles.length);
          const newFileList = [];
          $file.walkDir(s.normalize('sample_dir'), function(file) {
            newFileList.push(file);
            return false;
          });
          expect(newFileList.length).to.be.eql(1);
        });
        it('The loop is only aborted for a exact \'false\' boolean value', function() {
          _.each([null, undefined, 0, '', true, 'test'], function(returnValue) {
            const elements = [];
            $file.walkDir(s.normalize('sample_dir'), function(file) {
              elements.push(file);
              return returnValue;
            });
            expect(elements.length).to.be.eql(createdFiles.length);
          });
        });
      });
      describe('File access checks', function() {
        function checkAccess(testDefinitions, testFn) {
          _.each(testDefinitions, function(expectedResult, permissions) {
            const f = s.write('sample.txt', '');
            fs.chmodSync(f, permissions);
            expect(testFn(f)).to.be.eql(expectedResult);
            fs.removeSync(f);
          });
        }
        describe('#executable()', function() {
          it('Checks if a file is executable by the current user.', function() {
            // If the user is root and the file has any exec permissions, root can execute it
            const isRoot = process.getuid() === 0;
            checkAccess({
              '644': false,
              '647': isRoot ? true : false,
              '665': isRoot ? true : false,
              '654': isRoot ? true : false,
              '755': true
            }, $file.executable);
          });
          it('Returns false for non-existent files', function() {
            expect($file.executable(s.normalize('a/b/c/d')))
              .to.be.false;
          });
        });
        describe('#executableBy()', function() {
          it('Checks if a file is executable by a different user.', function() {
            checkAccess({
              '644': false,
              '647': true,
              '665': true,
              '654': false,
              '755': true
            }, f => $file.executableBy(f, 'daemon'));
          });
          it('Returns false for non-existent files', function() {
            expect($file.executableBy(s.normalize('a/b/c/d')), 'daemon')
              .to.be.false;
          });
          it('Properly checks if root has access', function() {
            const f = s.write('sample/file.txt', '');
            fs.chmodSync(f, '0777');
            expect($file.executableBy(f, 'root')).to.be.true;
            fs.chmodSync(f, '0666');
            expect($file.executableBy(f, 'root')).to.be.false;
          });
        });
        describe('#executableByOthers()', function() {
          it('Checks if a file is executable by "others"', function() {
            checkAccess({
              '774': false,
              '647': true,
              '665': true,
              '654': false,
              '751': true,
              '743': true,
              '755': true,
              '600': false
            }, $file.executableByOthers);
          });
          it('Returns false for non-existent files', function() {
            expect($file.executableByOthers(s.normalize('a/b/c/d')))
              .to.be.false;
          });
        });
        if (process.getuid() !== 0) {
          // TODO Testing as root user always allowed to write
          describe('#readable()', function() {
            beforeEach(function() {
              s.createFilesFromManifest({
                'file.txt': 'Sample text'
              });
            });
            it('Checks if a file is readable by the current user.', function() {
              const testFile = s.normalize('file.txt');
              // Checks if the file is actually readable
              expect(function() {
                fs.closeSync(fs.openSync(testFile, 'r'));
              }).not.to.throw.exception;
              expect($file.readable(testFile)).to.be.true;
            });
            it('Checks if a file is not readable by the current user.', function() {
              const testFile = s.normalize('file.txt');
              $file.chmod(testFile, {file: '222'});
              // Checks if the file is actually not readable
              expect(function() {
                fs.closeSync(fs.openSync(testFile, 'r'));
              }).to.throw.exception;
              expect($file.readable(testFile)).to.be.false;
            });
          });
        }
        describe('#readableBy()', function() {
          it('Checks if a file is readable by a different user', function() {
            checkAccess({
              '640': false,
              '647': true,
              '663': false,
              '654': true,
              '751': false
            }, f => $file.readableBy(f, 'daemon'));
          });
        });
        describe('#readableByOthers()', function() {
          it('Checks if a file is readable by "others"', function() {
            checkAccess({
              '774': true,
              '647': true,
              '665': true,
              '654': true,
              '751': false,
              '743': false,
              '755': true,
              '600': false
            }, $file.readableByOthers);
          });
        });
        if (process.getuid() !== 0) {
          // TODO Testing as root user always allowed to write
          describe('#writable()', function() {
            beforeEach(function() {
              s.createFilesFromManifest({
                'file.txt': 'Sample text'
              });
            });
            it('Checks if a file is writable by the current user.', function() {
              const testFile = s.normalize('file.txt');
              // Checks if the file is actually readable
              expect(function() {
                fs.closeSync(fs.openSync(testFile, 'w'));
              }).not.to.throw.exception;
              expect($file.writable(testFile)).to.be.true;
            });
            it('Checks if a file is not writable by the current user.', function() {
              const testFile = s.normalize('file.txt');
              $file.chmod(testFile, {file: '444'});
              // Checks if the file is actually not readable
              expect(function() {
                fs.closeSync(fs.openSync(testFile, 'w'));
              }).to.throw.exception;
              expect($file.writable(testFile)).to.be.false;
            });
            it('Checks the parent directory if it does not exists', function() {
              const dir = s.mkdir('dir1');
              const testFile = s.normalize('dir1/file.txt');
              expect(testFile).to.not.be.a.path();
              expect($file.writable(testFile)).to.be.true;
              fs.chmodSync(dir, '0555');
              expect($file.writable(testFile)).to.be.false;
            });
          });
        }
        describe('#writableBy()', function() {
          it('Checks if a file is writable by a different user', function() {
            checkAccess({
              '640': false,
              '647': true,
              '663': true,
              '654': false,
              '652': true,
              '656': true,
              '751': false
            }, f => $file.writableBy(f, 'daemon'));
          });
          it('Root can always write', function() {
            expect($file.writableBy(
              s.normalize('a/b/c/file.txt'),
              'root'
            )).to.be.true;
            const f = s.write('a/b/c/file.txt', '');
            fs.chmodSync(f, '0555');
            expect($file.writableBy(f, 'root')).to.be.true;
          });
          noRootIt('Properly checks if writable by the current user', function() {
            const username = execSync('whoami').toString().trim();
            const f = s.write('a/b/c/file.txt', '');
            expect($file.writableBy(f, username)).to.be.true;
            fs.chmodSync(f, '0555');
            expect($file.writableBy(f, username)).to.be.false;
          });
          it('Checks the parent directory if it does not exists', function() {
            const dir = s.mkdir('dir1');
            fs.chmodSync(dir, '0777');
            const testFile = s.normalize('dir1/file.txt');
            expect(testFile).to.not.be.a.path();
            expect($file.writableBy(testFile, 'daemon')).to.be.true;
            fs.chmodSync(dir, '0555');
            expect($file.writableBy(testFile, 'daemon')).to.be.false;
          });
        });
        describe('#writableByOthers()', function() {
          it('Checks if a file is writable by "others"', function() {
            checkAccess({
              '774': false,
              '772': true,
              '647': true,
              '646': true,
              '665': false,
              '654': false,
              '751': false,
              '743': true,
              '755': false,
              '600': false
            }, $file.writableByOthers);
          });
        });
      });
      describe('#exists()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            'existing_file.txt': 'Sample text'
          });
        });
        it('Checks if a file exists.', function() {
          const testFile = s.normalize('existing_file.txt');
          expect($file.exists(testFile)).to.be.true;
        });
        it('Checks if a file does not exist.', function() {
          const testFile = s.normalize('non_existing_file.txt');
          expect($file.exists(testFile)).to.be.false;
        });
        it('Throws an error if cannot detect if exists or not', function() {
          const testDir = s.mkdir('new_dir');
          $file.chmod(testDir, '000');
          expect(function() {
            $file.exists(`${testDir}/file.txt`);
          }).to.throw.exception;
          $file.chmod(testDir, '777');
        });
      });

      describe('#size()', function() {
        it('Gets the size of a given file.', function() {
          // We are generating a big chunck of random data, depending on the size may surpass the default timeout
          this.timeout(5000);
          const testFile = s.normalize('sample.dat');
          const size = _.random(5 * 1024, 2000 * 1024);
          const randomData = generateRandomData({maxBytes: size, minBytes: size});
          s.write(testFile, randomData, {encoding: 'binary'});
          expect($file.size(testFile)).to.be.eql(size);
        });
      });

      describe('#matches()', function() {
        it('Checks if file path matches a pattern', function() {
          const testFile = s.normalize('file.txt');
          expect($file.matches(testFile, ['**/*.txt'])).to.be.true;
          expect($file.matches(testFile, '**/*.xml')).to.be.false;
          expect($file.matches(testFile, '*.t')).to.be.false;
          expect($file.matches(testFile, '*.t*')).to.be.true;
        });
        it('Checks if file path matches excluding pattern', function() {
          const testFile = s.normalize('file.txt');
          expect($file.matches(testFile, '*.txt', '*foo*')).to.be.true;
          expect($file.matches(testFile, '*.txt', '*file*')).to.be.false;
        });
        it('Checks if file path matches a pattern (relative path works)', function() {
          const testFile = 'file.txt';
          expect($file.matches(testFile, ['*.txt'])).to.be.true;
          expect($file.matches(testFile, '*.xml')).to.be.false;
        });
        it('Properly resolves different glob matching patters', function() {
          const file = '/opt/bitnami/nami/test-asdf/doc*/data?/sample-[a-z]/file.txt';
          _.each({
            '*/a': false,
            '*/file.txt': true,
            '*file.txt': true,
            '/opt/bitnami/*': true,
            '/opt/bitnami/*.txt': true,
            '/opt/bitnami/*/foo/*.txt': false,
            '/opt/bitnami/*.xml': false,
            '/opt/bitnami/*.???': true,
            '/opt/bitnami/*.??': false,
            '/opt/bitnami/*/doc\\*': false,
            '/opt/bitnami/*/doc\\*/*': true,
            '/opt/bitnami/*/data\\?/*': true,
            '/opt/bitnami/n[a-z]mi/*': true,
            '/opt/bitnami/n[a-z]mi/*/sample-[a-z]/*.txt': false,
            '/opt/bitnami/n[a-z]mi/*/sample-\\[a-z\\]/*.txt': true
          }, function(expected, pattern) {
            expect($file.matches(file, pattern)).to.be.eql(expected);
          });
        });
      });


      describe('#dirname()', function() {
        it('Gets the parent directory of a specified file/directory.', function() {
          const testFile = s.normalize('sample_dir/file.txt');
          const expected = s.normalize('sample_dir');
          expect($file.dirname(testFile)).to.be.eql(expected);
        });
      });

      describe('#basename()', function() {
        it('Gets the basename of a file.', function() {
          const testFile = s.normalize('sample_dir/file.txt');
          expect($file.basename(testFile)).to.be.eql('file.txt');
        });
      });

      describe('#touch()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            'file.txt': 'Sample text'
          });
        });
        it('Creates empty file if it does not exist.', function() {
          const testFile = s.normalize('sample.dat');
          $file.touch(testFile);
          const exists = fs.existsSync(testFile);
          expect(exists).to.be.true;
        });
        it('Modifies the access/modification time of a file.', function(done) {
          this.timeout(5000);
          const testFile = s.normalize('file.txt');
          const before = fs.statSync(testFile).mtime;

          setTimeout(function() {
            $file.touch(testFile);
            const after = fs.statSync(testFile).mtime;
            const difference = after - before;
            // more than 1000ms is rounded to 2s in real time
            expect(difference > 1000).to.be.true;
            done();
          }, 2000);
        });
      });
      const fileComponents = {
        '/tmp/sample_dir/file.txt': ['/', 'tmp', 'sample_dir', 'file.txt'],
        'a/b/c': ['a', 'b', 'c'],
        '////a//b//c/': ['/', 'a', 'b', 'c']
      };
      describe('#split()', function() {
        it('Gets an array with the elements in the path.', function() {
          _.each(fileComponents, function(components, file) {
            expect($file.split(file)).to.be.eql(components);
          });
        });
      });
      describe('#join()', function() {
        it('Gets path from an array of components', function() {
          _.each(fileComponents, function(components, file) {
            expect($file.join(components)).to.be.eql(file.replace(/\/+/g, '/').replace(/\/+$/, ''));
          });
        });
        it('Gets path from an list of arguments', function() {
          expect($file.join('/a', 'b/', '/c/')).to.be.eql('/a/b/c');
          expect($file.join('/')).to.be.eql('/');
        });
      });

      describe('#mkdir()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            'existing_file': 'Sample text'
          });
        });
        it('Create directory if it does not exist.', function() {
          const testDir = s.normalize('new_dir');
          $file.mkdir(testDir);
          expect(testDir).to.be.a.directory();
        });
        it('Throws an error if the path exists and it is a file.', function() {
          const testDir = s.normalize('existing_file');
          expect(function() {
            $file.mkdir(testDir);
          }).to.throw(/already exist.*file/);
        });
      });

      describe('#normalize()', function() {
        it('Absolutizes a relative path, expanding the "~" character', function() {
          const testFile = '~/..';
          expect($file.normalize(testFile)).to.be.eql(path.dirname(process.env.HOME));
        });
      });

      describe('#isLink()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            'file': 'Sample text'
          });
        });
        it('Detects if a file is a symbolic link.', function() {
          const testFile = s.normalize('file');
          const testLink = s.normalize('link');
          fs.symlinkSync(testFile, testLink);
          expect($file.isLink(testLink)).to.be.true;
        });
        it('Detects if a file is not a symbolic link.', function() {
          const testFile = s.normalize('file');
          expect($file.isLink(testFile)).to.be.false;
        });
      });

      describe('#isDirectory()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            sample_dir: {'file.txt': 'Sample text'}
          });
        });
        it('Detects if a given path is a directory.', function() {
          const testDir = s.normalize('sample_dir');
          expect($file.isDirectory(testDir)).to.be.true;
        });
        it('Detects if a given path is a not a directory.', function() {
          const testFile = s.normalize('sample_dir/file.txt');
          expect($file.isDirectory(testFile)).to.be.false;
        });
      });

      describe('#isFile()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            sample_dir: {'file.txt': 'Sample text'}
          });
        });
        it('Detects if a given path is a file.', function() {
          const testFile = s.normalize('sample_dir/file.txt');
          expect($file.isFile(testFile)).to.be.true;
        });
        it('Detects if a given path is not a file.', function() {
          const testDir = s.normalize('sample_dir');
          expect($file.isFile(testDir)).to.be.false;
        });
      });

      describe('#isBinary()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            'file.txt': 'Sample text'
          });
        });
        it('Detects if a given file is binary.', function() {
          // Use node's binary for the test
          const testFile = process.execPath;
          expect($file.isBinary(testFile)).to.be.true;
        });
        it('Detects if a file is not binary.', function() {
          const testFile = s.normalize('file.txt');
          expect($file.isBinary(testFile)).to.be.false;
        });
      });

      describe('#contains()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            'file.txt': 'Some text... @@TARGET_STRING@@ ...the end'
          });
        });
        it('Detects if the content of a file contains a given string.', function() {
          const testFile = s.normalize('file.txt');
          expect($file.contains(testFile, '@@TARGET_STRING@@')).to.be.true;
        });
        it('Detects if the content of a file does not contain a given string.', function() {
          const testFile = s.normalize('file.txt');
          expect($file.contains(testFile, 'Wrong string')).to.be.false;
        });
        it('Detects if the content of a file matches a given regular expression.', function() {
          const testFile = s.normalize('file.txt');
          expect($file.contains(testFile, /@@[^@]*@@/)).to.be.true;
        });
        it('Detects if the content of a file does not match a given regular expression.', function() {
          const testFile = s.normalize('file.txt');
          expect($file.contains(testFile, /##[^#]*##/)).to.be.false;
        });
      });

      describe('#deleteIfEmpty()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            sample_dir: {
              'file.txt': 'SAMPLE',
              'empty_dir': {},
              'other_dir': {
                'a': {'b': {'c': {}, 'foo.txt': 'FOO', 'bar.png': 'BAR'}}
              }
            }
          });
        });
        it('Deletes directories if they are empty.', function() {
          const testDir = s.normalize('sample_dir/empty_dir');
          $file.deleteIfEmpty(testDir);
          expect(testDir).to.not.be.a.path();
        });
        it('Avoids deleting non-empty directories.', function() {
          const testDir = s.normalize('sample_dir');
          $file.deleteIfEmpty(testDir);
          expect(testDir).to.be.a.path();
        });
      });

      describe('#isEmptyDir()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            sample_dir: {
              'file.txt': 'SAMPLE',
              'empty_dir': {},
              'other_dir': {
                'a': {'b': {'c': {}, 'foo.txt': 'FOO', 'bar.png': 'BAR'}}
              }
            }
          });
        });
        it('Detects if a given directory is empty.', function() {
          const testDir = s.normalize('sample_dir/empty_dir');
          expect($file.isEmptyDir(testDir)).to.be.true;
        });
        it('Detects if a given directory is not empty.', function() {
          const testDir = s.normalize('sample_dir');
          expect($file.isEmptyDir(testDir)).to.be.false;
        });
      });

      describe('#copy()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            'sample_dir': {'file.dat': 'Exclude me!'}
          });
        });
        it('Copies files', function() {
          // We are generating a big chunck of random data, depending on the size may surpass the default timeout
          this.timeout(5000);
          const randomData = generateRandomData();
          const originFile = s.write('origin.txt', randomData, {encoding: 'binary'});
          const destFile = s.normalize('destination.txt');
          $file.copy(originFile, destFile);
          // Compare base64 to avoid printing a binary to console if the test fails
          expect(new Buffer(randomData).toString('base64')).to.be.eql(new Buffer(s.read(destFile)).toString('base64'));
        });
        it('Copies directories', function() {
          // We are generating a big chunck of random data, depending on the size may surpass the default timeout
          this.timeout(5000);
          const randomData = generateRandomData();
          const originDir = s.normalize('sample_dir');
          s.write(`${originDir}/file.txt`, randomData, {encoding: 'binary'});
          const destDir = s.normalize('copied_dir');
          $file.copy(originDir, destDir);
          // Compare base64 to avoid printing a binary to console if the test fails
          expect(new Buffer(randomData).toString('base64'))
            .to.be.eql(new Buffer(s.read(`${destDir}/file.txt`)).toString('base64'));
        });
        it('Uses patterns to exclude files from being copied.', function() {
          // We are generating a big chunck of random data, depending on the size may surpass the default timeout
          this.timeout(5000);
          const randomData = generateRandomData();
          const originDir = s.normalize('sample_dir');
          s.write(`${originDir}/file.txt`, randomData, {encoding: 'binary'});
          const destDir = s.normalize('copied_dir');
          $file.copy(originDir, destDir, {exclude: '**/*.dat'});
          expect(`${destDir}/file.dat`).not.to.be.a.path();
          expect(`${destDir}/file.txt`).to.be.a.path();
        });
        it('Supports wildcards', function() {
          s.createFilesFromManifest({
            new_dir: {
              'file.txt': 'SAMPLE',
              'file2.txt': 'SAMPLE2',
              'file3.txt': 'SAMPLE3',
              'file4.dat': 'SAMPLE4',
              'other_dir': {
                'file5.json': '{"name": "foo"}'
              }
            }
          });
          const destDir = s.mkdir('destination_dir');
          const newDir = s.normalize('new_dir');
          const textFiles = ['file.txt', 'file2.txt', 'file3.txt'].sort();
          $file.copy(`${newDir}/*.txt`, destDir);
          expect(textFiles).to.be.eql(fs.readdirSync(destDir).sort());
        });
        it('Allows copying files with literal regexp-like characters', function() {
          const basename = 'r+e.gex[c]a(r)s*.txt';
          const f = s.write(basename, '');
          const destDir = s.mkdir('new_destination_dir');
          $file.copy(f, destDir);
          expect(path.join(destDir, basename)).to.be.a.path();
        });
        it('Supports copying a list of files', function() {
          const manifest = {
            'file.txt': 'SAMPLE',
            'file2.txt': 'SAMPLE2'
          };
          const fileList = s.createFilesFromManifest(manifest);
          let destDir = s.mkdir('destination_dir2');
          $file.copy(fileList, destDir);
          expect(_.keys(manifest)).to.be.eql(fs.readdirSync(destDir).sort());

          destDir = s.mkdir('destination_dir3');
          $file.copy(fileList, destDir, {exclude: ['**/file.txt']});
          expect(['file2.txt']).to.be.eql(fs.readdirSync(destDir).sort());
        });
      });

      describe('#rename()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            'sample_dir': {'file.dat': 'Exclude me!', dir2: {'file2.txt': 'Some text'}}
          });
        });
        it('Moves/renames files', function() {
          // We are generating a big chunck of random data, depending on the size may surpass the default timeout
          this.timeout(5000);
          const randomData = generateRandomData();
          const originFile = s.write('origin.txt', randomData, {encoding: 'binary'});
          const destFile = s.normalize('destination.txt');
          $file.rename(originFile, destFile);
          // Compare base64 to avoid printing a binary to console if the test fails
          expect(new Buffer(randomData).toString('base64')).to.be.eql(new Buffer(s.read(destFile)).toString('base64'));
          expect(originFile).not.to.be.a.path();
        });
        it('Moves/renames directories', function() {
          // We are generating a big chunck of random data, depending on the size may surpass the default timeout
          this.timeout(5000);
          const randomData = generateRandomData();
          const originDir = s.normalize('empty_dir');
          s.write(`${originDir}/file.txt`, randomData, {encoding: 'binary'});
          const destDir = s.normalize('copied_dir');
          $file.rename(originDir, destDir);
          // Compare base64 to avoid printing a binary to console if the test fails
          expect(destDir).to.be.a.directory();
          expect(new Buffer(randomData).toString('base64'))
            .to.be.eql(new Buffer(s.read(`${destDir}/file.txt`)).toString('base64'));
          expect(originDir).not.to.be.a.path();
          expect('${originFile}/file.txt').not.to.be.a.path();
        });
        it('Moves/renames directories inside already existing directories', function() {
          const originDir = s.normalize('sample_dir');
          const destDir = s.normalize('empty_dir');
          $file.mkdir(destDir);
          $file.rename(originDir, destDir);
          expect(destDir).to.be.a.directory();
          expect(path.join(destDir, 'sample_dir')).to.be.a.directory();
          expect(path.join(destDir, 'sample_dir', 'file.dat')).to.be.a.path();
          expect(path.join(destDir, 'sample_dir', 'dir2')).to.be.a.directory();
          expect(originDir).not.to.be.a.path();
          expect(path.join(destDir, 'file.dat')).not.to.be.a.path();
        });
      });

      describe('#backup()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            'sample_dir': {'file.dat': 'Save me!'}
          });
        });
        it('Creates backups of files', function() {
          const tail = 'file.dat';
          const testFile = s.normalize(`sample_dir/${tail}`);
          const backupFile = $file.backup(testFile);
          expect(path.basename(backupFile)).to.match(new RegExp(`^${tail}_\\d+$`));
          expect(backupFile).to.be.a.file().and.equal(testFile);
          $file.delete(testFile);
          // Make sure they are not the same file
          expect(testFile).to.not.be.a.path();
          expect(backupFile).to.be.a.file();
        });
      });
      describe('File ownership', function() {
        describe('#getOwnerAndGroup()', function() {
          it('Properly reads file ownership', function() {
            const sampleFile = s.write('sample.txt');
            const username = execSync('whoami').toString().trim();
            const group = execSync('groups').toString().trim().split(' ')[0];
            const uid = process.getuid();
            const gid = process.getgid();
            fs.chownSync(sampleFile, uid, gid);
            const ownershipData = $file.getOwnerAndGroup(sampleFile);
            expect(ownershipData).to.be.eql({username: username, groupname: group, uid: uid, gid: gid});
          });
        });
      });
      describe('#permissions()', function() {
        it('Properly reads foile permissions', function() {
          _.each(['0755', '0644', '0400', '0000', '0555'], function(permissions) {
            const file = s.write(`sample-${permissions}.txt`);
            fs.chmodSync(file, permissions);
            expect($file.permissions(file)).to.be.eql(permissions);
          });
        });
      });
      describe('#chmod()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            'sample_dir': {'file.dat': 'Save me!', 'installer.exe': 'Execute me!'}
          });
        });
        it('Changes files permissions', function() {
          let testFile = s.normalize('sample_dir/file.dat');
          let perm = '400';
          $file.chmod(testFile, perm);
          expect(normalizePermissions(perm)).to.be.eql(getFilePermissions(testFile));
          perm = '664';
          $file.chmod(testFile, perm);
          expect(normalizePermissions(perm)).to.be.eql(getFilePermissions(testFile));
          testFile = s.normalize('sample_dir/installer.exe');
          perm = '770';
          $file.chmod(testFile, perm);
          expect(normalizePermissions(perm)).to.be.eql(getFilePermissions(testFile));
        });
        it('Changes folders permissions', function() {
          const testDir = s.normalize('sample_dir');
          let perm = '0400';
          $file.chmod(testDir, perm);
          expect(perm).to.be.eql(getFilePermissions(testDir));
          // Don't remove this below part or the test will not be able to delete the sandbox
          perm = '0775';
          $file.chmod(testDir, perm);
          expect(perm).to.be.eql(getFilePermissions(testDir));
        });
        it('Changes permissions recursively attending to if it is a file or a directory', function() {
          const testDir = s.normalize('sample_dir');
          const testFile = s.normalize('sample_dir/file.dat');
          const permDir = '700';
          const permFile = '640';
          $file.chmod(testDir, {file: permFile, directory: permDir}, {recursive: true});
          expect(normalizePermissions(permDir)).to.be.eql(getFilePermissions(testDir));
          expect(normalizePermissions(permFile)).to.be.eql(getFilePermissions(testFile));
        });
      });

      describe('#setAttrs()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            'sample_dir': {'file.txt': 'Sample text'}
          });
        });
        it('Modifies the attributes of a file.', function() {
          const now = getCurrentDate();
          const testFile = s.normalize('sample_dir/file.txt');
          const mtimeBefore = fs.statSync(testFile).mtime.getTime();
          const atimeBefore = fs.statSync(testFile).atime.getTime();
          const permissionsBefore = getFilePermissions(testFile);
          const expectedPermissions = '0620';

          // Checks if the file has a previous date
          expect(now).not.to.be.eql(mtimeBefore);
          expect(now).not.to.be.eql(atimeBefore);
          expect(permissionsBefore).not.to.be.eql(expectedPermissions);

          $file.setAttrs(testFile, {atime: now, mtime: now, mode: expectedPermissions});

          const mtimeAfter = fs.statSync(testFile).mtime.getTime();
          const atimeAfter = fs.statSync(testFile).atime.getTime();
          const permissionsAfter = getFilePermissions(testFile);

          expect(now).to.be.eql(mtimeAfter);
          expect(now).to.be.eql(atimeAfter);
          expect(expectedPermissions).to.be.eql(permissionsAfter);
        });
      });


      describe('#getAttrs()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            'sample_dir': {'file.txt': 'Sample text'}
          });
        });
        it('Gets the attributes of a file.', function() {
          const testFile = s.normalize('sample_dir/file.txt');
          const mtime = fs.statSync(testFile).mtime.getTime();
          const atime = fs.statSync(testFile).atime.getTime();
          const ctime = fs.statSync(testFile).ctime.getTime();
          const permissions = getFilePermissions(testFile);
          const type = 'file';

          const fileAttrs = $file.getAttrs(testFile);

          expect(fileAttrs.mtime.getTime()).to.be.eql(mtime);
          expect(fileAttrs.atime.getTime()).to.be.eql(atime);
          expect(fileAttrs.ctime.getTime()).to.be.eql(ctime);
          expect(fileAttrs.mode).to.be.eql(permissions);
          expect(fileAttrs.type).to.be.eql(type);
        });
        it('Gets the attributes of a directory.', function() {
          const testDir = s.normalize('sample_dir');
          const mtime = fs.statSync(testDir).mtime.getTime();
          const atime = fs.statSync(testDir).atime.getTime();
          const ctime = fs.statSync(testDir).ctime.getTime();
          const permissions = getFilePermissions(testDir);
          const type = 'directory';

          const fileAttrs = $file.getAttrs(testDir);

          expect(fileAttrs.mtime.getTime()).to.be.eql(mtime);
          expect(fileAttrs.atime.getTime()).to.be.eql(atime);
          expect(fileAttrs.ctime.getTime()).to.be.eql(ctime);
          expect(fileAttrs.mode).to.be.eql(permissions);
          expect(fileAttrs.type).to.be.eql(type);
        });
      });

      describe('#mtime()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            'sample_dir': {'file.txt': 'Sample text'}
          });
        });
        it('Gets the modification time of a file.', function() {
          const testFile = s.normalize('sample_dir/file.txt');
          const mtime = fs.statSync(testFile).mtime.getTime();
          expect($file.mtime(testFile).getTime()).to.be.eql(mtime);
        });
      });

      describe('#eachLine()', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            'sample_dir': {'file.txt': 'Sample text\nMore text.\nNew line.\nEven more text.'}
          });
        });
        it('Gets the modification time of a file.', function() {
          const testFile = s.normalize('sample_dir/file.txt');
          const destFile = s.normalize('sample_dir/destination.txt');
          const readData = s.read(testFile, {encoding: 'binary'});
          let lines = 0;
          let changed = 0;
          const re = /^(.*)text(.*)$/;
          $file.eachLine(
            testFile,
            line => {
              lines++;
              if (re.test(line)) { changed++; }
              return line;
            },
            text => $file.write(destFile, text)
          );
          const readDestData = s.read(destFile, {encoding: 'binary'});
          // Expect the file to have been copied
          expect(readData).to.be.eql(readDestData);

          // Correct number of total and changed lines
          expect(lines).to.be.eql(4);
          expect(changed).to.be.eql(3);
        });
        it('Allows early-aborting iterating over lines', function() {
          const file = s.write('sample_dir/test.txt', _.repeat('line\n', 10));
          const breakpoint = 3;
          let cont = 0;
          $file.eachLine(file, function() {
            cont++;
            if (cont === breakpoint) return false;
          });
          expect(cont).to.be.eql(breakpoint);
        });
      });

      describe('$file.ini', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            'sample_dir': {
              'properties.ini': 'scope=global\n[General]\ninstalldir=/opt/bitnami\n[Apache]\napache_server_port=80'
            }
          });
        });
        describe('#get()', function() {
          it('Gets values from .ini files.', function() {
            const testFile = s.normalize('sample_dir/properties.ini');
            const expectedScope = 'global';
            const expectedInstalldir = '/opt/bitnami';
            const expectedPort = '80';

            expect($file.ini.get(testFile, null, 'scope')).to.be.eql(expectedScope);
            expect($file.ini.get(testFile, 'General', 'installdir')).to.be.eql(expectedInstalldir);
            expect($file.ini.get(testFile, 'Apache', 'apache_server_port')).to.be.eql(expectedPort);
          });
        });
        describe('#set()', function() {
          it('Sets values in .ini files, new parameter in the global section', function() {
            const testFile = s.normalize('sample_dir/properties.ini');
            const section = null;
            const newParameter = 'version';
            const value = '1.0.0';

            // We will check the existing information doesn't get deleted
            const expectedScope = 'global';
            const expectedInstalldir = '/opt/bitnami';
            const expectedPort = '80';

            $file.ini.set(testFile, section, newParameter, value);
            expect($file.ini.get(testFile, section, newParameter)).to.be.eql(value);

            expect($file.ini.get(testFile, null, 'scope')).to.be.eql(expectedScope);
            expect($file.ini.get(testFile, 'General', 'installdir')).to.be.eql(expectedInstalldir);
            expect($file.ini.get(testFile, 'Apache', 'apache_server_port')).to.be.eql(expectedPort);
          });
          it('Sets values in .ini files, new parameter in a existing section', function() {
            const testFile = s.normalize('sample_dir/properties.ini');
            const section = 'General';
            const newParameter = 'version';
            const value = '1.0.0';

            // We will check the existing information doesn't get deleted
            const expectedPort = '80';
            const expectedInstalldir = '/opt/bitnami';

            $file.ini.set(testFile, section, newParameter, value);
            expect($file.ini.get(testFile, section, newParameter)).to.be.eql(value);

            expect($file.ini.get(testFile, 'General', 'installdir')).to.be.eql(expectedInstalldir);
            expect($file.ini.get(testFile, 'Apache', 'apache_server_port')).to.be.eql(expectedPort);
          });
          it('Sets values in .ini files, new parameter and section.', function() {
            const testFile = s.normalize('sample_dir/properties.ini');
            const newSection = 'NewSection';
            const newParameter = 'version';
            const value = '1.0.0';

            // We will check the existing information doesn't get deleted
            const expectedPort = '80';
            const expectedInstalldir = '/opt/bitnami';

            $file.ini.set(testFile, newSection, newParameter, value);
            expect($file.ini.get(testFile, newSection, newParameter)).to.be.eql(value);

            expect($file.ini.get(testFile, 'General', 'installdir')).to.be.eql(expectedInstalldir);
            expect($file.ini.get(testFile, 'Apache', 'apache_server_port')).to.be.eql(expectedPort);
          });
          it('Sets values in .ini files, overriding existing parameters', function() {
            const testFile = s.normalize('sample_dir/properties.ini');
            const section = 'General';
            const parameter = 'installdir';
            const value = '/home/bitnami';

            $file.ini.set(testFile, section, parameter, value);
            expect($file.ini.get(testFile, section, parameter)).to.be.eql(value);
          });
        });
      });

      describe('$file.xml', function() {
        beforeEach(function() {
          s.createFilesFromManifest({
            'sample_dir': {
              'project.xml': `
<project version="1.0" shortname="test" preferredMode="text">
  <fullName>Test Project</fullName>
  <emptyNode/>
  <parameterList>
    <directoryParameter name="installdir" value="/tmp"/>
  </parameterList>
</project>
`
            }
          });
        });
        describe('#get()', function() {
          it('Gets values from .xml files.', function() {
            const testFile = s.normalize('sample_dir/project.xml');
            const expectedVersion = '1.0';
            const expectedShortname = 'test';
            const expectedFullname = 'Test Project';
            const expectedInstalldir = '/tmp';

            expect($file.xml.get(testFile, '//project', 'version')[0]).to.be.eql(expectedVersion);
            expect($file.xml.get(testFile, '//project', 'shortname')[0]).to.be.eql(expectedShortname);
            expect($file.xml.get(testFile, '//project/fullName')[0]).to.be.eql(expectedFullname);
            expect(
              $file.xml.get(testFile, '//project/parameterList/directoryParameter[@name="installdir"]', 'value')[0]
            ).to.be.eql(expectedInstalldir);
          });
        });
        describe('#set()', function() {
          it('Creates attributes for existing nodes in .xml files', function() {
            const testFile = s.normalize('sample_dir/project.xml');
            const newVendor = 'fooBar Inc.';

            $file.xml.set(testFile, '//project', 'vendor', newVendor);
            expect($file.xml.get(testFile, '//project', 'vendor')[0]).to.be.eql(newVendor);
          });
          it('Modifies the value of existing attributes .xml files', function() {
            const testFile = s.normalize('sample_dir/project.xml');
            const newVersion = '2.0';
            const newShortname = 'sample';

            $file.xml.set(testFile, '//project', {shortname: newShortname, version: newVersion});
            expect($file.xml.get(testFile, '//project', 'version')[0]).to.be.eql(newVersion);
            expect($file.xml.get(testFile, '//project', 'shortname')[0]).to.be.eql(newShortname);
          });
          it('Deletes attributes for existing nodes in .xml files', function() {
            const testFile = s.normalize('sample_dir/project.xml');

            $file.xml.set(testFile, '//project', 'preferredMode', null);
            expect($file.xml.get(testFile, '//project', 'preferredMode')[0]).to.be.empty;
          });
          it('Modifies text nodes in .xml files', function() {
            const testFile = s.normalize('sample_dir/project.xml');
            const newFullname = 'Sample';

            $file.xml.set(testFile, '//project/fullName', newFullname);

            expect($file.xml.get(testFile, '//project/fullName')[0]).to.be.eql(newFullname);
          });
          it('Replaces nodes by text nodes in .xml files', function() {
            const testFile = s.normalize('sample_dir/project.xml');
            const newParameterList = 'none';

            $file.xml.set(testFile, '//project/parameterList', newParameterList);
            expect($file.xml.get(testFile, '//project/parameterList')[0]).to.be.eql(newParameterList);
            expect(function() {
              $file.xml.get(testFile, '//project/parameterList/directoryParameter');
            }).to.throw.exception;
          });
          it('Deletes nodes in .xml files', function() {
            const testFile = s.normalize('sample_dir/project.xml');

            $file.xml.set(testFile, '//project/emptyNode', null);
            expect(function() {
              $file.xml.get(testFile, '//project/emptyNode');
            }).to.throw.exception;
          });
          it('Accepts a function as value for directly operate over the node object', function() {
            const testFile = s.normalize('sample_dir/project.xml');
            const newTag = 'newTag';
            const newTagText = 'new text';

            const result = $file.xml.set(testFile, '//project', 'version', function(node) {
              return node.nodeValue;
            });
            expect(result).to.be.eql('1.0');

            $file.xml.set(testFile, '//project', function(node, doc) {
              const newNode = doc.createElement(newTag);
              newNode.appendChild(doc.createTextNode(newTagText));
              node.appendChild(newNode);
            });
            expect($file.xml.get(testFile, `//project/${newTag}`)[0]).to.be.eql(newTagText);
          });
          it('Throws an error when using invalid calls', function() {
            const testFile = s.normalize('sample_dir/project.xml');
            const invalid = ['invalid'];

            expect(() => $file.xml.set(testFile, '//project', invalid)).to.throw.exception;
            expect(() => $file.xml.set(testFile, '//project', invalid, invalid)).to.throw.exception;
            expect(() => $file.xml.set(testFile, '//project', 'version', invalid)).to.throw.exception;
            expect(() => $file.xml.set(testFile, '//project', invalid, 'version')).to.throw.exception;
            expect(() => $file.xml.set(testFile, '//project', null, 'version')).to.throw.exception;
            expect(() => $file.xml.set(testFile, '//project', null, null)).to.throw.exception;
          });
        });
      });
      describe('$file.yaml', function() {
        beforeEach(function() {
          const yamlData = fs.readFileSync(path.join(__dirname, './data/sample.yml'), 'utf8');
          s.createFilesFromManifest({
            'sample_dir': {'properties.yaml': yamlData}
          });
        });
        describe('#get()', function() {
          it('Convert all the file to an object', function() {
            const testFile = s.normalize('sample_dir/properties.yaml');

            const content = {
              'boolean': true, 'field1': 'content1',
              'field2': {
                'subfield1': 'item5',
                'subfield2': 'item6',
                'subfield3': 'item7'
              },
              'field3': [{
                'subfield4': 'item8',
                'subfield5': 'item9'
              }, {
                'subfield6': 'item10',
                'subfield7': 'item11'
              }],
              'field4': {
                'subfield8': 'item12',
                'subfield9': {
                  'subsubfield1': 'item13'
                }
              },
              'float': 123.4, 'integer': 123, 'list1': [
                'item1',
                'item2'
              ],
              'list2': [
                'item3',
                'item4'
              ],
              'string': 'example'
            };

            expect($file.yaml.get(testFile, null)).to.be.eql(content);
            expect($file.yaml.get(testFile)).to.be.eql(content);
            expect($file.yaml.get(testFile, '/')).to.be.eql(content);
          });
          it('Returns default value when key not exists', function() {
            const testFile = s.normalize('sample_dir/properties.yaml');

            expect($file.yaml.get(testFile, 'nonexisting')).to.be.eql('');
            expect($file.yaml.get(testFile, 'nonexisting', {'default': 'not defined'})).to.be.eql('not defined');
          });
          it('Gets lists, dictionaries and combinations of them', function() {
            const testFile = s.normalize('sample_dir/properties.yaml');

            _.each({
              'field1': 'content1',
              'field2': {'subfield1': 'item5', 'subfield2': 'item6', 'subfield3': 'item7'},
              'field3': [{'subfield4': 'item8', 'subfield5': 'item9'}, {'subfield6': 'item10', 'subfield7': 'item11'}],
              'list1': ['item1', 'item2'],
              'list2': ['item3', 'item4']
            }, function(expected, field) {
              expect($file.yaml.get(testFile, field)).to.be.eql(expected);
            });
          });
          it('Gets inner keys', function() {
            const testFile = s.normalize('sample_dir/properties.yaml');

            _.each({
              'field2/subfield1': 'item5',
              '/field2/subfield1': 'item5',
              'field4/subfield9/subsubfield1': 'item13',
              '/field4/subfield9/subsubfield1': 'item13',
              'subfield1': ''
            }, function(expected, field) {
              expect($file.yaml.get(testFile, field)).to.be.eql(expected);
            });

            expect(function() {
              $file.yaml.get(testFile, '/field1/subfield1');
            }).to.throw(Error);
          });
          it('Infers types', function() {
            const testFile = s.normalize('sample_dir/properties.yaml');

            _.each({
              'integer': 123,
              'float': 123.4,
              'boolean': true,
              'string': 'example'
            }, function(expected, field) {
              expect($file.yaml.get(testFile, field)).to.be.eql(expected);
            });
          });
        });
        describe('#set()', function() {
          it('Adds parameter to root', function() {
            const testFile = s.normalize('sample_dir/properties.yaml');

            _.each({
              'newParameter1': 'this.is.a.new.parameter',
              'newParameter2': {'subfield1': 'value', 'subfield2': 'anothervalue'},
              'newParameter3': [
                {'subfield1': 'value', 'subfield2': 'value2'},
                {'subfield3': 'value3', 'subfield4': 'value4'}
              ]
            }, function(value, parameter) {
              $file.yaml.set(testFile, parameter, value);
              expect($file.yaml.get(testFile, parameter)).to.be.eql(value);
            });

            // Check previous information is still there
            _.each({
              'field1': 'content1',
              'field2': {'subfield1': 'item5', 'subfield2': 'item6', 'subfield3': 'item7'},
              'field3': [{'subfield4': 'item8', 'subfield5': 'item9'}, {'subfield6': 'item10', 'subfield7': 'item11'}],
              'field4': {'subfield8': 'item12', 'subfield9': {'subsubfield1': 'item13'}},
              'list1': ['item1', 'item2'],
              'list2': ['item3', 'item4'],
              'integer': 123,
              'float': 123.4,
              'boolean': true,
              'string': 'example'
            }, function(value, parameter) {
              expect($file.yaml.get(testFile, parameter)).to.be.eql(value);
            });
          });
          it('Updates value on root', function() {
            const testFile = s.normalize('sample_dir/properties.yaml');

            _.each({
              'field1': 'new.value',
              'field2': 987,
              'field3': {'key': 'value'}
            }, function(value, parameter) {
              $file.yaml.set(testFile, parameter, value);
              expect($file.yaml.get(testFile, parameter)).to.be.eql(value);
            });

            // Check previous information is still there
            _.each({
              'field4': {'subfield8': 'item12', 'subfield9': {'subsubfield1': 'item13'}},
              'list1': ['item1', 'item2'],
              'list2': ['item3', 'item4'],
              'integer': 123,
              'float': 123.4,
              'boolean': true,
              'string': 'example'
            }, function(value, parameter) {
              expect($file.yaml.get(testFile, parameter)).to.be.eql(value);
            });
          });
          it('Adds inner key', function() {
            const testFile = s.normalize('sample_dir/properties.yaml');
            const param1 = 'field1';
            const param2 = 'field2';
            const param3 = 'field3';
            const subparam = 'subfield0';
            const value = 'value2';

            expect(function() {
              $file.yaml.set(testFile, `${param1}/${subparam}`, value);
            }).to.throw(Error);
            expect($file.yaml.get(testFile, param1)).to.be.eql('content1');

            expect(function() {
              $file.yaml.set(testFile, [param1, subparam], value);
            }).to.throw(Error);
            expect($file.yaml.get(testFile, param1)).to.be.eql('content1');

            $file.yaml.set(testFile, `${param2}/${subparam}`, value);
            expect($file.yaml.get(testFile, param2)).to.be.eql({
              'subfield1': 'item5',
              'subfield2': 'item6',
              'subfield3': 'item7',
              [subparam]: value}
            );

            expect(function() {
              $file.yaml.set(testFile, `${param3}/${subparam}`, value);
            }).to.throw(Error);
            expect($file.yaml.get(testFile, param3)).to.be.eql(
              [
                {'subfield4': 'item8', 'subfield5': 'item9'},
                {'subfield6': 'item10', 'subfield7': 'item11'}
              ]
            );

            // Check previous information is still there
            _.each({
              'field4': {'subfield8': 'item12', 'subfield9': {'subsubfield1': 'item13'}},
              'list1': ['item1', 'item2'],
              'list2': ['item3', 'item4'],
              'integer': 123,
              'float': 123.4,
              'boolean': true,
              'string': 'example'
            }, function(val, parameter) {
              expect($file.yaml.get(testFile, parameter)).to.be.eql(val);
            });
          });
          it('Replaces inner key', function() {
            const testFile = s.normalize('sample_dir/properties.yaml');
            const key = 'field2/subfield1';
            const value = 'value';

            $file.yaml.set(testFile, key, value);
            expect($file.yaml.get(testFile, key)).to.be.eql(value);

            // Check previous information is still there
            _.each({
              'field1': 'content1',
              'field3': [{'subfield4': 'item8', 'subfield5': 'item9'}, {'subfield6': 'item10', 'subfield7': 'item11'}],
              'field4': {'subfield8': 'item12', 'subfield9': {'subsubfield1': 'item13'}},
              'list1': ['item1', 'item2'],
              'list2': ['item3', 'item4'],
              'integer': 123,
              'float': 123.4,
              'boolean': true,
              'string': 'example'
            }, function(val, parameter) {
              expect($file.yaml.get(testFile, parameter)).to.be.eql(val);
            });
          });
          it('Replaces inner key (starting key with \'/\')', function() {
            const testFile = s.normalize('sample_dir/properties.yaml');
            const key = '/field2/subfield1';
            const value = 'value';

            $file.yaml.set(testFile, key, value);
            expect($file.yaml.get(testFile, key)).to.be.eql(value);

            // Check previous information is still there
            _.each({
              'field1': 'content1',
              'field3': [{'subfield4': 'item8', 'subfield5': 'item9'}, {'subfield6': 'item10', 'subfield7': 'item11'}],
              'field4': {'subfield8': 'item12', 'subfield9': {'subsubfield1': 'item13'}},
              'list1': ['item1', 'item2'],
              'list2': ['item3', 'item4'],
              'integer': 123,
              'float': 123.4,
              'boolean': true,
              'string': 'example'
            }, function(val, parameter) {
              expect($file.yaml.get(testFile, parameter)).to.be.eql(val);
            });
          });
          it('Adds keymap', function() {
            const testFile = s.normalize('sample_dir/properties.yaml');
            const newfield = 'km';
            const newvalue = {'km31': 0, 'km32': [0, 1, 2, 3]};
            const existingField = 'field1';
            const updatedValue = 'othervalue';
            const keymap = {[newfield]: newvalue, [existingField]: updatedValue};

            $file.yaml.set(testFile, keymap);
            expect($file.yaml.get(testFile, newfield)).to.be.eql(newvalue);
            expect($file.yaml.get(testFile, existingField)).to.be.eql(updatedValue);

            $file.yaml.set(testFile, keymap, {'retryOnENOENT': true});
            expect($file.yaml.get(testFile, newfield)).to.be.eql(newvalue);
            expect($file.yaml.get(testFile, existingField)).to.be.eql(updatedValue);

            // Check previous information is still there
            _.each({
              'field3': [{'subfield4': 'item8', 'subfield5': 'item9'}, {'subfield6': 'item10', 'subfield7': 'item11'}],
              'field4': {'subfield8': 'item12', 'subfield9': {'subsubfield1': 'item13'}},
              'list1': ['item1', 'item2'],
              'list2': ['item3', 'item4'],
              'integer': 123,
              'float': 123.4,
              'boolean': true,
              'string': 'example'
            }, function(val, parameter) {
              expect($file.yaml.get(testFile, parameter)).to.be.eql(val);
            });
          });
          it('Creates a file if it does not exist', function() {
            const testFile = s.normalize('sample_dir/propertiesNew.yaml');

            _.each({
              'newparameter1': 'this.is.a.new.parameter',
              'newparameter2': {'subfield1': 'value', 'subfield2': 'anothervalue'},
              'newparameter3': [
                {'subfield1': 'value', 'subfield2': 'value2'},
                {'subfield3': 'value3', 'subfield4': 'value4'}
              ]
            }, function(val, parameter) {
              $file.yaml.set(testFile, parameter, val);
              expect($file.yaml.get(testFile, parameter)).to.be.eql(val);
            });
          });
          it('Throw exception if wrong parameters', function() {
            const testFile = s.normalize('sample_dir/properties.yaml');

            expect(function() {
              $file.yaml.set(testFile, {field1: 'value1'}, 'value', {'retryOnENOENT': true});
            }).to.throw(Error);

            expect(function() {
              $file.yaml.set(testFile);
            }).to.throw(Error);

            expect(function() {
              $file.yaml.set(testFile, 123, 'value', {'retryOnENOENT': true});
            }).to.throw(Error);
          });
          it('Throw exception if key in array format is incorrect', function() {
            const testFile = s.normalize('sample_dir/properties.yaml');
            expect(function() {
              $file.yaml.set(testFile, ['field2', 2, 'subsubfield1'], 'value', {'retryOnENOENT': true});
            }).to.throw(Error);
          });
        });
      });

      if (os.platform !== 'win32' && !process.getuid()) {
        describe('#chown()', function() {
          const newOwner = parseInt(execSync('id -u daemon').toString().trim(), 10);
          beforeEach(function() {
            s.createFilesFromManifest({
              'sample_dir': {'file.txt': 'Sample text.'}
            });
          });
          it('Changes the owner of files.', function() {
            const testFile = s.normalize('sample_dir/file.txt');
            const uidBefore = fs.statSync(testFile).uid;
            const gidBefore = fs.statSync(testFile).gid;

            $file.chown(testFile, newOwner, null);
            expect(fs.statSync(testFile).uid).not.to.be.eql(uidBefore);
            expect(fs.statSync(testFile).uid).to.be.eql(newOwner);
            expect(fs.statSync(testFile).gid).to.be.eql(gidBefore);
          });
          it('Changes the owner of directories.', function() {
            const testDir = s.normalize('sample_dir');
            const testFile = s.normalize('sample_dir/file.txt');
            const uidDirBefore = fs.statSync(testDir).uid;
            const gidDirBefore = fs.statSync(testDir).gid;
            const uidFileBefore = fs.statSync(testFile).uid;
            const gidFileBefore = fs.statSync(testFile).gid;

            $file.chown(testDir, newOwner, null);
            // If this fails we should think of change the new owner
            expect(fs.statSync(testDir).uid).not.to.be.eql(uidDirBefore);
            expect(fs.statSync(testDir).uid).to.be.eql(newOwner);

            expect(fs.statSync(testDir).gid).to.be.eql(gidDirBefore);
            expect(fs.statSync(testFile).uid).to.be.eql(uidFileBefore);
            expect(fs.statSync(testFile).gid).to.be.eql(gidFileBefore);
          });
          it('Changes the owner of directories and their content recursively.', function() {
            const testDir = s.normalize('sample_dir');
            const testFile = s.normalize('sample_dir/file.txt');
            const uidDirBefore = fs.statSync(testDir).uid;
            const gidDirBefore = fs.statSync(testDir).gid;
            const gidFileBefore = fs.statSync(testFile).gid;

            $file.chown(testDir, newOwner, null, {recursive: true});
            expect(fs.statSync(testDir).uid).not.to.be.eql(uidDirBefore);
            expect(fs.statSync(testDir).uid).to.be.eql(newOwner);
            expect(fs.statSync(testFile).uid).to.be.eql(newOwner);

            expect(fs.statSync(testDir).gid).to.be.eql(gidDirBefore);
            expect(fs.statSync(testFile).gid).to.be.eql(gidFileBefore);
          });
          it('Changes the group of files.', function() {
            const testFile = s.normalize('sample_dir/file.txt');
            const uidBefore = fs.statSync(testFile).uid;
            const gidBefore = fs.statSync(testFile).gid;

            $file.chown(testFile, null, newOwner);
            expect(fs.statSync(testFile).gid).not.to.be.eql(gidBefore);
            expect(fs.statSync(testFile).gid).to.be.eql(newOwner);
            expect(fs.statSync(testFile).uid).to.be.eql(uidBefore);
          });
          it('Changes the group of directories.', function() {
            const testDir = s.normalize('sample_dir');
            const testFile = s.normalize('sample_dir/file.txt');
            const uidDirBefore = fs.statSync(testDir).uid;
            const gidDirBefore = fs.statSync(testDir).gid;
            const uidFileBefore = fs.statSync(testFile).uid;
            const gidFileBefore = fs.statSync(testFile).gid;

            $file.chown(testDir, null, newOwner);
            // If this fails we should think of change the new owner
            expect(fs.statSync(testDir).gid).not.to.be.eql(gidDirBefore);
            expect(fs.statSync(testDir).gid).to.be.eql(newOwner);

            expect(fs.statSync(testDir).uid).to.be.eql(uidDirBefore);
            expect(fs.statSync(testFile).uid).to.be.eql(uidFileBefore);
            expect(fs.statSync(testFile).gid).to.be.eql(gidFileBefore);
          });
          it('Changes the group of directories and their content recursively.', function() {
            const testDir = s.normalize('sample_dir');
            const testFile = s.normalize('sample_dir/file.txt');
            const uidDirBefore = fs.statSync(testDir).uid;
            const gidDirBefore = fs.statSync(testDir).gid;
            const uidFileBefore = fs.statSync(testFile).uid;

            $file.chown(testDir, null, newOwner, {recursive: true});
            expect(fs.statSync(testDir).gid).not.to.be.eql(gidDirBefore);
            expect(fs.statSync(testDir).gid).to.be.eql(newOwner);
            expect(fs.statSync(testFile).gid).to.be.eql(newOwner);

            expect(fs.statSync(testDir).uid).to.be.eql(uidDirBefore);
            expect(fs.statSync(testFile).uid).to.be.eql(uidFileBefore);
          });
          it('Changes owner to root', function() {
            expect(newOwner).not.to.be.eql(0);
            const testFile = s.normalize('sample_dir/file.txt');
            fs.chownSync(testFile, newOwner, newOwner);
            $file.chown(testFile, 'root', 'root');
            expect(fs.statSync(testFile).uid).to.be.eql(0);
            expect(fs.statSync(testFile).gid).to.be.eql(0);
          });
        });
      }
    });
  });
});
