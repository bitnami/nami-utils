'use strict';

const chai = require('chai');
const chaiFs = require('chai-fs');
const fs = require('fs-extra');
const expect = chai.expect;
const _ = require('lodash');
const cp = require('child_process');
const execSync = cp.execSync;
const spawn = cp.spawn;
const Sandbox = require('nami-test/lib/sandbox');
const $os = require('../os');
chai.use(chaiFs);

/* eslint-disable no-unused-expressions */

let rootIt = null;
let rootDescribe = null;
if (process.getuid() === 0) {
  rootIt = it;
  rootDescribe = describe;
} else {
  rootIt = xit;
  rootDescribe = xdescribe;
}

function _commandExists(command) {
  try {
    execSync(`which ${command}`);
    return true;
  } catch (e) {
    return false;
  }
}

describe('$os package', function() {
  function getNonExistentPid() {
    // We start with a weird enough PID
    let pid = 54321;
    let count = 0;
    let exists = true;
    do {
      try {
        execSync(`ps ${pid}`);
        count += 1;
        // We use big increments to minimize the chances of consecutive processes
        pid += 1000;
      } catch (e) {
        exists = false;
      }
      if (count > 10) {
        throw new Error('Cannot find a non-running PID');
      }
    } while (exists);
    return pid;
  }

  let currentPlatform = null;
  let currentArch = null;
  before(function() {
    const unameText = execSync('uname -a').toString();
    currentArch = unameText.match(/x86_64/) ? 'x64' : 'x86';
    if (unameText.match(/Darwin/)) {
      currentPlatform = 'osx';
    } else if (unameText.match(/linux/i)) {
      currentPlatform = 'linux';
    } else {
      throw new Error('Unknown platform');
    }
  });

  // TODO: This is not complete. We have to keep testing all the public allowed options
  describe('#runProgram()', function() {
    it('Executes simple cmd successfully', function() {
      $os.runProgram('ls');
      expect($os.runProgram('echo', ['foo'])).to.be.eql('foo\n');
    });
    it('Executes simple cmd providing arguments as string', function() {
      expect($os.runProgram('echo', '-n this \\"is\\" \\{ a \\} test')).to.be.eql('this "is" { a } test');
    });
    it('Executes simple cmd providing arguments as array', function() {
      expect($os.runProgram('echo', ['-n', 'this', '"is"', '{', 'a', '}', 'test'])).to.be.eql('this "is" { a } test');
    });
    it('By default, fails when command fails', function() {
      expect(function() {
        $os.runProgram('echo', 'Error executing program >&2 && exit 1');
      }).to.throw(Error, 'Error executing program\n');
    });
    it('Provide a default error message if the process do not write to stderr', function() {
      expect(function() {
        $os.runProgram('exit', '2');
      }).to.throw(Error, 'Program exited with exit code 2');
    });
    it('Can be configured to capture std streams and never fail', function() {
      expect($os.runProgram('echo', 'Error executing program >&2 && exit 1', {retrieveStdStreams: true}))
        .to.eql({stderr: 'Error executing program\n', stdout: '', code: 1});
    });
    describe('Failure management', function() {
      let child = null;
      let sb = null;
      let pidFile = null;
      before(function() {
        sb = new Sandbox();
        pidFile = sb.normalize('run.pid');
        const shellScript = sb.write('run.sh', `
#!/bin/sh
PID_FILE="${pidFile}"
echo $$ >> $PID_FILE
while [ true ]; do
  sleep 0.1
done
`);
        fs.chmodSync(shellScript, '0755');
        const worker = sb.write('worker.js', `
const $os = require('${__dirname}/../os');
process.on('message', function() {
  process.send('start');
  // Pass results back to parent process
  process.send($os.runProgram('${shellScript}', {retrieveStdStreams: true}));
});`);
        child = cp.fork(worker);
      });
      after(function() {
        child.disconnect();
        sb.cleanup();
      });
      it('Properly reports exit code on killed processes', function(done) {
        child.on('message', function(msg) {
          if (msg === 'start') {
            setTimeout(function() {
              const pid = parseInt(fs.readFileSync(pidFile).toString().trim(), 10);
              if (_.isFinite(pid)) {
                process.kill(pid, 'SIGKILL');
              }
            }, 200);
          } else {
            // Exit code should be 128 + signal (SIGKILL is 9)
            expect(msg.code).to.be.eql(128 + 9);
            expect(msg.stderr).to.be.eql('Terminated\n');
            done();
          }
        });
        child.on('exit', function(code) {
          if (code !== 0) {
            done('Child failed');
          }
        });
        child.send('run');
      });
    });
    it('Do not reports any default stderr message if the process did not write to it when retrieving std streams',
       function() {
         expect($os.runProgram('exit', '2', {retrieveStdStreams: true})).to.eql({stderr: '', stdout: '', code: 2});
       }
      );
    describe('Std streams handing', function() {
      let sb = null;
      beforeEach(function() {
        sb = new Sandbox();
      });
      afterEach(function() {
        sb.cleanup();
      });
      it('Supports providing files as stdout and stderr', function() {
        let stdoutFile = sb.normalize('stdout.txt');
        let stderrFile = sb.normalize('stderr.txt');
        const text = 'this is a sample text';
        let res = $os.runProgram('echo', `-n ${text}`, {
          stdoutFile: stdoutFile,
          stderrFile: stderrFile,
          retrieveStdStreams: true
        });
        expect(res.stdout).to.be.eql(text);
        expect(fs.readFileSync(stdoutFile).toString()).to.be.eql(text);
        expect(res.stderr).to.be.eql('');
        expect(fs.readFileSync(stderrFile).toString()).to.be.eql('');

        stdoutFile = sb.normalize('stdout-2.txt');
        stderrFile = sb.normalize('stderr-2.txt');

        res = $os.runProgram('echo', `-n ${text} >&2`, {
          stdoutFile: stdoutFile,
          stderrFile: stderrFile,
          retrieveStdStreams: true
        });
        expect(res.stderr).to.be.eql(text);
        expect(fs.readFileSync(stderrFile).toString()).to.be.eql(text);
        expect(res.stdout).to.be.eql('');
        expect(fs.readFileSync(stdoutFile).toString()).to.be.eql('');
      });
    });
    rootDescribe('Running programs as different users', function() {
      function parseIdOutput(text) {
        const idParseRe = /^uid=(\d+)\(([^\)]+)\)\s+gid=(\d+)\(([^\)]+)\)/;
        const match = text.match(idParseRe);
        const uid = parseInt(match[1], 10);
        const username = match[2];
        const gid = parseInt(match[3], 10);
        const groupname = match[4];
        return {username, groupname, uid, gid};
      }

      const user = 'daemon';
      const userData = parseIdOutput(execSync(`id ${user}`).toString().trim());
      if (user !== userData.username) {
        throw new Error(`Error detecting user information ${user} != ${userData.username}`);
      }

      it('Supports the runAs property or the uid to execute as a different user', function() {
        _.each([userData.username, userData.uid], function(userSpec) {
          _.each(['runAs', 'uid'], function(key) {
            const options = {};
            options[key] = userSpec;
            expect($os.runProgram('whoami', options).trim()).to.be.eql(user);
          });
        });
      });
      it('Supports executing commands with different gid and uid', function() {
        const options = {};
        options.uid = userData.uid;
        let data = parseIdOutput($os.runProgram('id', options).trim());
        expect(data.uid).to.be.eql(userData.uid);
        // We did not provide gid yet, so it is inherited
        expect(data.gid).to.be.eql(process.getgid());
        options.gid = userData.gid;
        data = parseIdOutput($os.runProgram('id', options).trim());
        expect(data.uid).to.be.eql(userData.uid);
        expect(data.gid).to.be.eql(userData.gid);
      });
    });
  });
  describe('#spawnAsync()', function() {
    let sb = null;
    before(function() {
      sb = new Sandbox();
      sb.createFilesFromManifest({
        sample_dir: {
          script: 'echo Line 1\nsleep 0.2\nLine 2\nsleep 0.2\nLine 3'
        }
      });
    });
    after(function() {
      sb.cleanup();
    });
    it('Executes processes in background', function(done) {
      const handler = $os.spawnAsync('sleep', ['0.5']);
      expect(handler.running).to.be.true;
      expect(handler.pid).to.be.above(1);
      setTimeout(function() {
        if (handler.running) {
          done(new Error('Expected the process to not be running'));
        } else {
          done();
        }
      }, 1000);
    });
    it('Allows to set a timeout for the process to finish before continuing', function(done) {
      const result = $os.spawnAsync('sleep', ['1s'], {wait: true, timeout: 0.2});

      // The property running will reflect the state of the process when the handler was detached
      expect(result.running).to.be.true;

      expect(result.handler.kill(0)).to.be.true;
      setTimeout(function() {
        // Using kill(0) because {wait: true} detaches the handler from the process
        // so the 'running' property is no longer updated
        if (result.handler.kill(0)) {
          done(new Error('Expected the process to not be running'));
        } else {
          done();
        }
      }, 1000);
    });
    it('Allows to throw an error if the timeout is due', function() {
      expect(() => $os.spawnAsync('sleep', ['3s'], {wait: true, timeout: 1, throwOnTimeout: true}))
        .to.throw(/Exceeded timeout/);
    });
    it('Allows to stop the process using the handler', function(done) {
      const handler = $os.spawnAsync('sleep', ['2s']);
      expect(handler.running).to.be.true;
      expect(handler.kill()).to.be.true;
      setTimeout(function() {
        if (handler.running) {
          done(new Error('Expected the process to not be running'));
        } else {
          done();
        }
      }, 200);
    });
    it('Allows to kill the process using the handler', function(done) {
      const handler = $os.spawnAsync('sleep', ['2s']);
      expect(handler.running).to.be.true;
      expect(handler.kill('SIGKILL')).to.be.true;
      setTimeout(function() {
        if (handler.running) {
          done(new Error('Expected the process to not be running'));
        } else {
          done();
        }
      }, 200);
    });
    it('Allows to access process output', function() {
      const expected = 'Some text';
      const handler = $os.spawnAsync('echo', [expected], {wait: true});
      expect(handler.stdout).to.be.eql(`${expected}\n`);
    });
    it('Allows to write the output to a file', function() {
      const expected = 'Some text';
      const outputFile = sb.normalize('sample_dir/output');
      $os.spawnAsync('echo', [expected], {wait: true, stdoutFile: outputFile});
      expect(sb.read(outputFile)).to.be.eql(`${expected}\n`);
    });
    it('Allows to handle standard streams using callbacks', function() {
      const script = sb.normalize('sample_dir/script');
      let output = '';
      const handler = $os.spawnAsync('sh', [script], {wait: true,
                                      onStdout: (data) => {
                                        output += data.toString();
                                      }
                                     });
      expect(handler.stdout).to.be.eql(output);
    });
    it('Allows to execute commands from a specified directory', function() {
      const cwd = sb.normalize('sample_dir');
      const handler = $os.spawnAsync('pwd', {cwd: cwd, wait: true});
      expect(handler.stdout).to.be.eql(`${cwd}\n`);
    });
  });

  describe('#isPlatform()', function() {
    // If we ever support Windows, we have to improve this
    it('It detects the current platform', function() {
      expect($os.isPlatform(currentPlatform)).to.be.eql(true);
    });
    it('It detects the current platform inlcuding architecture', function() {
      expect($os.isPlatform(`${currentPlatform}-${currentArch}`)).to.be.eql(true);
    });
    it('It returns false if the platform does not match', function() {
      expect($os.isPlatform('fakeplatform')).to.be.eql(false);
    });
  });

  // We only support UNIX for now so it is not very useful. If we ever support Windows, we have to disable this
  describe('#isUnix()', function() {
    it('Detects is running on Unix', function() {
      expect($os.isUnix()).to.be.eql(true);
    });
  });

  describe('#findInPath()', function() {
    it('Finds binaries in the path', function() {
      _.each(['ls', 'chown', 'which'], function(binary) {
        const binPath = execSync(`which ${binary}`).toString().trim();
        expect($os.findInPath(binary)).to.be.eql(binPath);
      });
    });
    it('Returns null if cannot find the binary', function() {
      expect($os.findInPath('this_should_not_exists')).to.be.eql(null);
    });
  });

  describe('#isInPath()', function() {
    it('Returns true for binaries in the path', function() {
      expect($os.isInPath('ls')).to.be.eql(true);
    });
    it('Returns false for binaries not in the path', function() {
      expect($os.isInPath('this_should_not_exists')).to.be.eql(false);
    });
  });

  describe('#pidFind()', function() {
    it('Detects running process', function() {
      expect($os.pidFind(process.pid)).to.be.eql(true);
    });
    it('Does not detect a non existing process', function() {
      expect($os.pidFind(getNonExistentPid())).to.be.eql(false);
    });
  });
  describe('#ps()', function() {
    let prog = null;
    const expected = {};

    function checkResults(result, reference) {
      return _.every(_.keys(reference), key => reference[key] === result[key]);
    }

    before(function() {
      const cmd = 'sleep';
      const cmdArgs = ['10'];

      prog = spawn(cmd, cmdArgs, {detached: true, stdio: 'ignore'});
      expected.pid = prog.pid;
      expected.user = execSync('whoami').toString().trim();
      expected.cmd = cmd;
      expected.full_cmd = [cmd].concat(cmdArgs).join(' ');
      prog.unref();
    });
    it('Finds by pid', function() {
      const result = $os.ps(expected.pid);
      expect(checkResults(result, expected)).to.be.true;
    });
    it('Filter using hash', function() {
      const result = $os.ps({pid: expected.pid});
      expect(result).to.be.instanceof(Array).and.have.length(1);
      expect(checkResults(result[0], expected)).to.be.true;
    });
    it('Returns all running processes when called without arguments', function() {
      const result = $os.ps();
      expect(result).to.be.instanceof(Array).and.have.length.above(1);
      expect(checkResults(_.find(result, {pid: expected.pid}), expected)).to.be.true;
    });
    it('Filters using a function', function() {
      const result = $os.ps(e => e.pid === expected.pid);
      expect(result).to.be.instanceof(Array).and.have.length(1);
      expect(checkResults(result[0], expected)).to.be.true;
    });
    it('Fails providing a wrong filterer', function() {
      expect(function() {
        $os.ps([]);
      }).to.throw(/Don't know how to handle filterer/);
    });
    after(function() {
      prog.kill();
    });
  });
  describe('File ownership', function() {
    const username = execSync('id -u -n').toString().trim();
    const groupname = execSync('id -g -n').toString().trim();
    const uid = parseInt(execSync('id -u').toString().trim(), 10);
    const gid = parseInt(execSync('id -g').toString().trim(), 10);
    describe('#getUid()', function() {
      it('getUid from current user', function() {
        expect(uid).to.be.eql($os.getUid(username));
      });
    });
    describe('#getGid()', function() {
      it('getGid from current group', function() {
        expect(gid).to.be.eql($os.getGid(groupname));
      });
    });
    describe('#groupExists()', function() {
      it('groupExists of current group is true', function() {
        expect($os.groupExists(groupname)).to.be.eql(true);
      });
      it('non-existent group returns false', function() {
        expect($os.groupExists('nonexistentgroup')).to.be.eql(false);
      });
    });
    describe('#userExists()', function() {
      it('userExists of current user is true', function() {
        expect($os.userExists(username)).to.be.eql(true);
      });
      it('non-existent user returns false', function() {
        expect($os.userExists('nonexistentuser')).to.be.eql(false);
      });
    });
    describe('#getUsername()', function() {
      it('getUsername from current user', function() {
        expect(username).to.be.eql($os.getUsername(uid));
      });
    });
    describe('#getGroupname()', function() {
      it('getGid from current group', function() {
        expect(groupname).to.be.eql($os.getGroupname(gid));
      });
    });
  });
  rootDescribe('#getUserGroups()', function() {
    const user = `user_${_.random('10000', '100000')}`;
    before(function() {
      $os.addGroup(user);
      $os.addUser(user, {gid: $os.findGroup(user).id});
    });
    it('Get specific user groups', function() {
      expect($os.getUserGroups(user)).to.be.eql([user]);
    });
    after(function() {
      $os.deleteUser(user);
      $os.deleteGroup(user);
    });
  });
  describe('#findUser()', function() {
    it('Return user data', function() {
      const user = execSync('whoami').toString().trim();
      expect($os.findUser(user)).to.be.eql({name: user, id: process.getuid()});
    });
  });
  describe('#findGroup()', function() {
    it('Return group data', function() {
      const idData = execSync('id').toString().trim();
      const match = idData.match(/groups=(\d+)\(([^\)]+)\)/);
      const groupName = match[2];
      const grpupId = parseInt(match[1], 10);
      expect($os.findGroup(groupName)).to.be.eql({name: groupName, id: grpupId});
    });
  });
  describe('System users and group management', function() {
    function groupCheck(groupname) {
      execSync(`getent group ${groupname}`);
    }
    function groupExists(groupname) {
      try {
        groupCheck(groupname);
        return true;
      } catch (e) {
        if (e.status === 2) {
          return false;
        } else {
          throw e;
        }
      }
    }
    function userCheck(username) {
      execSync(`getent passwd ${username}`);
    }
    function userExists(username) {
      try {
        userCheck(username);
        return true;
      } catch (e) {
        if (e.status === 2) {
          return false;
        } else {
          throw e;
        }
      }
    }
    function runWithSysPath(fn, sysPath) {
      const oldPATH = process.env.PATH;
      let result = null;
      try {
        process.env.PATH = sysPath;
        result = fn();
      } finally {
        process.env.PATH = oldPATH;
      }
      return result;
    }
    rootDescribe('#deleteGroup()', function() {
      let group = null;
      beforeEach(function() {
        group = `hp_test_group_${_.random('10000', '100000')}`;
        if (_commandExists('groupadd')) {
          execSync(`groupadd ${group}`);
        } else {
          execSync(`addgroup ${group}`);
        }
      });
      it('Deletes a group', function() {
        expect(groupExists(group)).to.be.eql(true);
        $os.deleteGroup(group);
        expect(groupExists(group)).to.be.eql(false);
      });
      it('Works regardless of a broken PATH', function() {
        expect(groupExists(group)).to.be.eql(true);
        runWithSysPath(() => $os.deleteGroup(group), '');
        expect(groupExists(group)).to.be.eql(false);
      });

      afterEach(function() {
        try {
          if (_commandExists('groupdel')) {
            execSync(`groupdel ${group}  2>/dev/null`);
          } else {
            execSync(`delgroup ${group}  2>/dev/null`);
          }
        } catch (e) {
          // we expect exceptions here when the test goes well
        }
      });
    });
    rootDescribe('#addGroup()', function() {
      let group = null;
      beforeEach(function() {
        group = `hp_test_group_${_.random('10000', '100000')}`;
      });
      it('Adds a group', function() {
        expect(groupExists(group)).to.be.eql(false);
        $os.addGroup(group);
        expect(groupExists(group)).to.be.eql(true);
      });
      it('Works regardless of a broken PATH', function() {
        expect(groupExists(group)).to.be.eql(false);
        runWithSysPath(() => $os.addGroup(group), '');
        expect(groupExists(group)).to.be.eql(true);
      });

      afterEach(function() {
        try {
          if (_commandExists('groupdel')) {
            execSync(`groupdel ${group}  2>/dev/null`);
          } else {
            execSync(`delgroup ${group}  2>/dev/null`);
          }
        } catch (e) {
          if (e.status !== 6) throw e;
        }
      });
    });
    rootDescribe('#addUser()', function() {
      let user = null;
      beforeEach(function() {
        user = `hp_test_user_${_.random('10000', '100000')}`;
      });
      rootIt('Adds an user', function() {
        expect(userExists(user)).to.be.eql(false);
        $os.addUser(user);
        expect(userExists(user)).to.be.eql(true);
      });
      rootIt('Adds a system user', function() {
        expect(userExists(user)).to.be.eql(false);
        $os.addUser(user, {systemUser: true});
        expect(userExists(user)).to.be.eql(true);
        expect(parseInt(execSync(`id -u ${user}`), 10)).to.be.within(100, 999);
      });
      rootIt('Works regardless of a broken PATH', function() {
        expect(userExists(user)).to.be.eql(false);
        runWithSysPath(() => $os.addUser(user), '');
        expect(userExists(user)).to.be.eql(true);
      });

      afterEach(function() {
        try {
          if (_commandExists('userdel')) {
            execSync(`userdel ${user}  2>/dev/null`);
          } else {
            execSync(`deluser ${user}  2>/dev/null}`);
          }
        } catch (e) {
          if (e.status !== 6) throw e;
        }
      });
    });
    rootDescribe('#deleteUser()', function() {
      let user = null;
      beforeEach(function() {
        user = `hp_test_user_${_.random('10000', '100000')}`;
        if (_commandExists('useradd')) {
          execSync(`useradd ${user}`);
        } else {
          execSync(`adduser -D ${user}`);
        }
      });
      it('Deletes an user', function() {
        expect(userExists(user)).to.be.eql(true);
        $os.deleteUser(user);
        expect(userExists(user)).to.be.eql(false);
      });
      it('Works regardless of a broken PATH', function() {
        expect(userExists(user)).to.be.eql(true);
        runWithSysPath(() => $os.deleteUser(user), '');
        expect(userExists(user)).to.be.eql(false);
      });

      afterEach(function() {
        try {
          if (_commandExists('userdel')) {
            execSync(`userdel ${user}  2>/dev/null`);
          } else {
            execSync(`deluser ${user}  2>/dev/null}`);
          }
        } catch (e) {
          // we expect exceptions here when the test goes well
        }
      });
    });
  });
  describe('#pidFind()', function() {
    it('Fins its own pid', function() {
      expect($os.pidFind(process.pid)).to.be.eql(true);
    });
    it('Returns false for non-existent pids', function() {
      // This will fail if process 1234567 exists, but I think
      // we can live with that
      expect($os.pidFind(1234567)).to.be.eql(false);
    });
  });

  describe('#kill()', function() {
    let sb = null;
    beforeEach(function() {
      sb = new Sandbox();
    });
    afterEach(function() {
      sb.cleanup();
    });
    this.timeout(5000);
    function runTrapScript(signal) {
      const script = sb.write('test.sh', `#!/bin/bash
function handler() {
exit $1
}
trap "handler ${signal}" ${signal}

for i in ${_.range(1, 300).join(' ')}; do sleep 0.01; done
`, {mode: '0755'});
      return spawn(script);
    }
    it('Sends signals to a running process', function(done) {
      let receivedText = '';
      const signal = 6;
      const child = runTrapScript(signal);
      child.stdout.on('data', d => { receivedText += d.toString(); });
      setTimeout(function() {
        $os.kill(child.pid, signal);
      }, 200);
      child.on('close', function(code) {
        if (code === signal) {
          done();
        } else {
          done(new Error('Did not receive all the sent signals'));
        }
      });
    });
    it('Allows checking the status using the 0 signal', function(done) {
      let receivedText = '';
      const child = runTrapScript('SIGKILL');
      child.stdout.on('data', d => { receivedText += d.toString(); });
      setTimeout(function() {
        if ($os.kill(child.pid, 0)) {
          done();
        } else {
          done(new Error('Process status did not properly resolved to true'));
        }
        $os.kill(child.pid, 'SIGKILL');
      }, 200);
    });
  });
  describe('#runningAsRoot()', function() {
    if (process.getuid() === 0) {
      it('Returns true when running as root', function() {
        expect($os.runningAsRoot()).to.be.eql(true);
      });
    } else {
      it('Returns false when running as non-root', function() {
        expect($os.runningAsRoot()).to.be.eql(false);
      });
    }
  });
  _.each({
    createTempFile: 'file',
    createTempDir: 'directory'
  }, function(type, fnName) {
    const fnToTest = $os[fnName];
    describe(`#${fnName}()`, function() {
      let tempFiles = [];
      beforeEach(function() {
        tempFiles = [];
      });
      afterEach(function() {
        _.each(tempFiles, f => fs.removeSync(f));
      });
      _.each({
        'Creates temporary paths': {
          onExitValidation: function() {
            // Temporary files are deleted on exit
            _.each(tempFiles, f => expect(f).to.not.be.a.path());
          }
        },
        'Allows marking the temportary paths to not be deleted': {
          options: {cleanup: false},
          onExitValidation: function() {
            _.each(tempFiles, f => expect(f).to.be.a[type]());
          }
        }
      }, function(testData, title) {
        it(title, function() {
          const times = 5;
          _.times(times, function() {
            const f = fnToTest(testData.options);
            expect(f).to.be.a[type]();
            tempFiles.push(f);
          });
          // Check they are unique
          expect(_.uniq(tempFiles).length).to.be.eql(times);
          // Simulate the process exiting
          process.emit('exit');
          testData.onExitValidation();
        });
      });
    });
  });
  // Private function for now
  // describe('#getTempFile()', function() {
  //   it('getTempFile sample test', function() {
  //     expect(false).to.be.eql(true);
  //   });
  // });
});
