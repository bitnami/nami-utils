'use strict';

const _ = require('../../lodash-extra.js');

const isPlatform = require('../is-platform.js');
const runProgram = require('../run-program.js');
const runningAsRoot = require('../running-as-root.js');
const userExists = require('./user-exists.js');
const _getNextOsxGid = require('./common.js').getNextOsxGid;
const _getNextOsxUid = require('./common.js').getNextOsxUid;

const _supportsNoUserGroup = _.memoize(
  () => {
    const helpText = runProgram('useradd', ['--help'], {logCommand: false});
    return !helpText.match(/--no-user-group/);
  }
);

function _dsclCreate(user, key, value) {
  const args = ['.', '-create', `/Users/${user}`];
  if (key) args.push(key, value);
  runProgram('dscl', args);
}

/**
 * Add a user to the system
 * @function $os~addUser
 * @param {string} user - Username
 * @param {Object} [options]
 * @param {boolean} [options.systemUser=false] - Set user as system user (UID within 100 and 999)
 * @param {string} [options.home=null] - User home directory
 * @param {string} [options.password=null] - User password
 * @param {string|number} [options.gid=null] - User Main Group ID
 * @param {string|number} [options.uid=null] - User ID
 * @param {string[]} [options.groups=[]] - Extra groups for the user
 * @example
 * // Creates a 'mysql' user and add it to 'mysql' group
 * $os.addUser('mysql', {gid: $os.getGid('mysql')});
 */
function addUser(user, options) {
  if (!runningAsRoot()) return;
  if (!user) throw new Error('You must provide an username');
  options = _.opts(options, {systemUser: false, home: null, password: null, gid: null, uid: null, groups: []});
  const runProgramOpts = {uid: 0, gid: 0, cwd: '/', logCommand: false};
  if (isPlatform('linux')) {
    if (userExists(user)) {
      return;
    }
    const args = [];
    if (options.home) args.push('-d', options.home);
    if (options.gid) {
      args.push('-g', options.gid);
    } else {
      if (_supportsNoUserGroup(runProgramOpts)) {
        args.push('--no-user-group');
      }
    }
    if (options.id) args.push('-u', options.uid);
    if (!_.isEmpty(options.groups)) args.push('-G', options.groups.join(','));
    args.push(user);
    if (options.password) runProgramOpts.input = `${options.password}\n${options.password}\n`;
    if (options.systemUser) args.push('-r');
    runProgram('useradd', args, runProgramOpts);
  } else if (isPlatform('osx')) {
    // TODO: Unify with linux options, missing groups
    const uid = options.id || _getNextOsxUid();
    const gid = options.gid || _getNextOsxGid();

    _dsclCreate(user);
    _dsclCreate(user, 'UserShell', '/bin/bash');
    _dsclCreate(user, 'RealName', user);
    _dsclCreate(user, 'UniqueID', uid);
    _dsclCreate(user, 'PrimaryGroupID', gid);
    if (options.home) { _dsclCreate(user, 'NFSHomeDirectory', options.home); }
    if (options.password) { runProgram('dscl', ['.', '-passwd', `/Users/${user}`, options.password]); }
    if (options.systemUser) {
      runProgram(
        'defaults',
        ['write', '/Library/Preferences/com.apple.loginwindow', 'HiddenUsersList', '-array-add', user]
      );
    }
  } else if (isPlatform('windows')) {
    throw new Error("Don't know how to add user in Windows");
  } else {
    throw new Error("Don't know how to add user in current platform");
  }
}

module.exports = addUser;
