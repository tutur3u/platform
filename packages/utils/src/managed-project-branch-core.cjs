// Git refname subset safe to interpolate into nginx, env files and git
// arguments: no leading dash or dot, no `..` or `//`, quotes or whitespace.
const SAFE_PROJECT_BRANCH_PATTERN =
  /^(?![-./])(?!.*(?:\.\.|\/\/|\/\.))[A-Za-z0-9._/-]{1,200}(?<![./])$/u;

function isSafeProjectBranch(branch) {
  return typeof branch === 'string' && SAFE_PROJECT_BRANCH_PATTERN.test(branch);
}

module.exports = { isSafeProjectBranch };
