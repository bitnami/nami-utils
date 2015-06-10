'use strict';

const chai = require('chai');
const expect = chai.expect;
const $hb = require('../templates');
const Sandbox = require('nami-test/lib/sandbox');

describe('$hb package', function() {
  let s = null;
  beforeEach(function() {
    s = new Sandbox();
  });
  afterEach(function() {
    s.cleanup();
  });
  describe('#renderText()', function() {
    it('Resolves ubstitutions', function() {
      const template = '{{company}} is cool and so is {{developer}}';
      const data = {company: 'Bitnami', developer: 'jj'};
      expect($hb.renderText(template, data)).to.be.eql('Bitnami is cool and so is jj');
    });
    it('By default, do not escape strings', function() {
      const str = "\"This ia a quoted string\" and some other chars ' to check";
      expect($hb.renderText('{{str}}', {str: str})).to.be.eql(str);
      expect($hb.renderText('{{str}}', {str: str}, {noEscape: false}))
        .to.be.eql(str.replace(/"/g, '&quot;').replace(/'/g, '&#x27;'));
    });
  });
  describe('#render()', function() {
    it('Resolves ubstitutions', function() {
      const template = '{{company}} is cool and so is {{developer}}';
      const data = {company: 'Bitnami', developer: 'jj'};
      const tpl = s.write('welcome.tpl', template);
      expect($hb.render(tpl, data))
        .to.be.eql('Bitnami is cool and so is jj');
    });
  });
  describe('#renderToFile()', function() {
    it('Resolves ubstitutions', function() {
      const template = '{{company}} is cool and so is {{developer}}';
      const data = {company: 'Bitnami', developer: 'jj'};
      const tpl = s.write('welcome.tpl', template);
      const destFile = s.normalize('welcome');
      $hb.renderToFile(tpl, destFile, data);
      expect(destFile)
        .to.have.content('Bitnami is cool and so is jj');
    });
  });
});
