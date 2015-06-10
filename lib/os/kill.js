'use strict';

const _ = require('../lodash-extra.js');

/**
 * Send signal to process
 * @function $os~kill
 * @param {number} pid - Process ID
 * @param {number|string} [signal=SIGINT] - Signal number or name
 * @returns {boolean} - True if it successed to kill the process
 * @example
 * // Send 'SIGKILL' signal to process 123213
 * $os.kill(123213, 'SIGKILL')
 * // => true
 */
function kill(pid, signal) {
  signal = _.isUndefined(signal) ? 'SIGINT' : signal;
  // process.kill does not recognize many of the well known numeric signals, only by name
  const signalMap = {
    '1': 'SIGHUP', '2': 'SIGINT', '3': 'SIGQUIT', '4': 'SIGILL', '5': 'SIGTRAP', '6': 'SIGIOT', '8': 'SIGFPE',
    '9': 'SIGKILL', '10': 'SIGBUS', '11': 'SIGSEGV', '12': 'SIGSYS', '13': 'SIGPIPE', '14': 'SIGALRM',
    '15': 'SIGTERM', '16': 'SIGURG', '17': 'SIGSTOP', '18': 'SIGTSTP', '19': 'SIGCONT', '20': 'SIGCHLD',
    '21': 'SIGTTIN', '22': 'SIGTTOU', '23': 'SIGIO', '24': 'SIGXCPU', '25': 'SIGXFSZ', '26': 'SIGVTALRM',
    '27': 'SIGPROF', '28': 'SIGWINCH', '30': 'SIGUSR1', '31': 'SIGUSR2'
  };
  if (_.has(signalMap, String(signal))) signal = signalMap[String(signal)];
  if (!_.isFinite(pid)) return false;
  try {
    process.kill(pid, signal);
  } catch (e) {
    return false;
  }
  return true;
}

module.exports = kill;
