'use strict';

const expect = require('chai').expect;
const net = require('net');
const $net = require('../net');
const _ = require('lodash');

describe('$net package', function() {
  const freePort = 16788;
  const freePrivilegedPort = 987;
  // Reuse port format validation tests for all functions receiving a port as argument
  function createPortFormatTests(toTestFunction) {
    it('Throws on malformed non-numeric ports', function() {
      _.each(['foobar', true, Infinity, -Infinity, NaN, null, [], {}, undefined], function(value) {
        expect(function() {
          toTestFunction(value);
        }).to.throw(/is not a valid number/);
      });
    });
    it('Throws on out of range ports', function() {
      _.each([-1, -14523, 65536, 165535], function(value) {
        expect(function() {
          toTestFunction(value);
        }).to.throw(/is not within the valid range \(0-65535\)/);
      });
    });
    it('Does not throw on valid ports', function() {
      _.each([0, 234, 45678, 34567, 65535], function(value) {
        expect(function() {
          toTestFunction(value);
        }).to.not.throw(Error);
      });
    });
  }

  function takePort(port, callback) {
    const server = net.createServer();
    server.listen(port, function() {
      callback(port);
      server.close();
    });
  }
  describe('#isPortInUse()', function() {
    it('Detects a port is not in use', function() {
      expect($net.isPortInUse(freePort)).to.be.eql(false);
    });
    it('Detects a port is in use', function(done) {
      takePort(16789, function(port) {
        if ($net.isPortInUse(port)) {
          done();
        } else {
          done(new Error('Port is not in use'));
        }
      });
    });
    createPortFormatTests($net.isPortInUse);
  });
  describe('#canBindToPort()', function() {
    it('It can bind to a given free port', function() {
      expect($net.canBindToPort(freePort)).to.be.eql(true);
    });
    it('Cannot bind to a taken port', function(done) {
      takePort(16889, function(port) {
        if ($net.canBindToPort(port)) {
          done(new Error(`Process should not be able to bind to taken port ${port}`));
        } else {
          done();
        }
      });
    });
    if (process.getuid() === 0) {
      it('Can bind to a privileged port as root', function() {
        expect($net.canBindToPort(freePrivilegedPort)).to.be.eql(true);
      });
    } else {
      it('Cannot bind to a privileged port as non-root', function() {
        expect($net.canBindToPort(freePrivilegedPort)).to.be.eql(false);
      });
    }
    createPortFormatTests($net.canBindToPort);
  });
  describe('#waitForPort()', function() {
    it('Waits for free port', function() {
      expect($net.waitForPort(freePort, {timeout: 1})).to.be.eql(true);
      expect($net.waitForPort(freePort, {state: 'free', timeout: 1})).to.be.eql(true);
      expect($net.waitForPortToBeFree(freePort, {timeout: 1})).to.be.eql(true);
    });
    it('Waits for bound port', function(done) {
      takePort(16789, function(port) {
        if ($net.waitForPort(port, {state: 'bound', timeout: 1})) {
          done();
        } else {
          done(new Error(`Port ${port} bound but not detected`));
        }
      });
      takePort(16789, function(port) {
        if ($net.waitForPortToBeBound(port, {timeout: 1})) {
          done();
        } else {
          done(new Error(`Port ${port} bound but not detected`));
        }
      });
    });
    it('Returns false on timeout waiting port to be free', function(done) {
      takePort(16789, function(port) {
        if ($net.waitForPort(port, {timeout: 1})) {
          done(new Error(`Port ${port} bound but not detected`));
        } else {
          done();
        }
      });
      takePort(16789, function(port) {
        if ($net.waitForPortToBeFree(port, {timeout: 1})) {
          done(new Error(`Port ${port} bound but not detected`));
        } else {
          done();
        }
      });
    });
    it('Returns false on timeout waiting port to be bound (I)', function() {
      expect($net.waitForPort(freePort, {state: 'bound', timeout: 1})).to.be.eql(false);
    });
    it('Returns false on timeout waiting port to be bound (II)', function() {
      expect($net.waitForPortToBeBound(freePort, {timeout: 1})).to.be.eql(false);
    });
  });
});
