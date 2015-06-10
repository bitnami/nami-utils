'use strict';

const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const gulp = require('gulp');
const replace = require('gulp-replace');
const runSequence = require('run-sequence');
const mocha = require('gulp-mocha');
const istanbul = require('gulp-istanbul');
const eslint = require('gulp-eslint');
const eslintTeamcity = require('eslint-teamcity');
const del = require('del');
const babel = require('gulp-babel');


/* CI tasks */

const testFiles = './test/*.js';
const srcFiles = ['*.js', './lib/**/*.js', testFiles];

const formatReportsConfig = {
  test: 'spec',
  coverage: ['lcov', 'json', 'text-summary', 'html'],
  lint: undefined
};

const formatReportsConfigCI = {
  test: 'mocha-teamcity-reporter',
  coverage: ['lcov', 'json', 'text-summary', 'html', 'teamcity'],
  lint: eslintTeamcity
};

// We have to find a way of doing this without global variables
function overrideFormatterForCI() {
  _.each(formatReportsConfigCI, (value, key) => {
    formatReportsConfig[key] = value;
  });
}

gulp.task('lint', () => {
  // ESLint ignores files with "node_modules" paths.
  // So, it's best to have gulp ignore the directory as well.
  // Also, Be sure to return the stream from the task;
  // Otherwise, the task may end before the stream has finished.
  return gulp.src(srcFiles)
    // eslint() attaches the lint output to the "eslint" property
    // of the file object so it can be used by other modules.
    .pipe(eslint())
    // eslint.format() outputs the lint results to the console.
    // Alternatively use eslint.formatEach() (see Docs).
    // .pipe(eslint.format('node_modules/eslint-teamcity/index.js'));
    .pipe(eslint.format(formatReportsConfig.lint));
    // To have the process exit with an error code (1) on
    // lint error, return the stream and pipe to failAfterError last.
    // .pipe(eslint.failAfterError());
});

gulp.task('pre-test', () => {
  return gulp.src(srcFiles)
    .pipe(replace(/ISTANBUL_IGNORE_IF_NOT_OSX/g, 'istanbul ignore next'))
    // Covering files
    .pipe(istanbul())
    // Force `require` to return covered files
    .pipe(istanbul.hookRequire());
});

gulp.task('test', ['pre-test'], () => {
  return gulp.src(testFiles, {read: false})
    .pipe(mocha({reporter: formatReportsConfig.test}))
    // Creating the reports after tests ran
    .pipe(istanbul.writeReports({reporters: formatReportsConfig.coverage}));
    // Enforce a coverage of at least 90%
    // .pipe(istanbul.enforceThresholds({ thresholds: { global: 90 } }));
});

_.each(['lint', 'test'], function(name) {
  gulp.task(`ci-${name}`, () => {
    overrideFormatterForCI();
    gulp.start(name);
  });
});

gulp.task('ci-tasks', () => {
  runSequence(['ci-lint', 'ci-test']);
});


/* Build tasks */

const buildDir = './build';
const npmPackageOutputDir = `${buildDir}/npm-package`;

function _fixPackageJsonForNpm() {
  const pkgInfo = JSON.parse(fs.readFileSync('./package.json'));
  delete pkgInfo.scripts;
  return pkgInfo;
}

gulp.task('npm-pack:clean', () => {
  return del([
    npmPackageOutputDir
  ]);
});

gulp.task('npm-pack:transpile', () => {
  return gulp.src([
    './index.js',
    './test/**/*.js'
  ], {base: './'})
.pipe(babel({presets: ['es2015']}))
.pipe(gulp.dest(npmPackageOutputDir));
});

gulp.task('npm-pack:copyMeta', () => {
  return gulp.src([
    './COPYING'
  ], {base: './'})
.pipe(gulp.dest(npmPackageOutputDir));
});

gulp.task('npm-pack:fixPackageInfo', () => {
  return fs.writeFileSync(path.join(npmPackageOutputDir, 'package.json'),
  JSON.stringify(_fixPackageJsonForNpm(), null, 2));
});

gulp.task('npm-pack', () => {
  runSequence(
    'npm-pack:clean',
    'npm-pack:transpile',
    'npm-pack:copyMeta',
    'npm-pack:fixPackageInfo'
  );
});


/* General tasks */

gulp.task('clean', () => {
  return del([
    'coverage/**/*',
    'reports/**/*',
    buildDir
  ]);
});

gulp.task('default', ['test']);
