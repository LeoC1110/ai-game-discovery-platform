import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

import { resolvers } from '../graphql/resolvers.js';
import User from '../models/User.js';
import EmailVerification from '../models/EmailVerification.js';
import GamePost from '../models/GamePost.js';
import Player from '../models/Player.js';

const originalUserFindOne = User.findOne;
const originalUserFindById = User.findById;
const originalUserCreate = User.create;
const originalUserCountDocuments = User.countDocuments;
const originalEmailVerificationFindOne = EmailVerification.findOne;
const originalEmailVerificationUpdateMany = EmailVerification.updateMany;
const originalEmailVerificationCreate = EmailVerification.create;
const originalGamePostFind = GamePost.find;
const originalPlayerFindOneAndUpdate = Player.findOneAndUpdate;
const originalNodeEnv = process.env.NODE_ENV;
const originalRequireEmailVerificationOnLogin = process.env.REQUIRE_EMAIL_VERIFICATION_ON_LOGIN;

const users = [];
const verifications = [];

const attachUserMethods = (user) => ({
  ...user,
  async save() {
    const idx = users.findIndex((u) => u.email === this.email);
    if (idx >= 0) users[idx] = this;
    return this;
  },
});

const attachVerificationMethods = (doc) => ({
  ...doc,
  async save() {
    const idx = verifications.findIndex((v) => v._id === this._id);
    if (idx >= 0) verifications[idx] = this;
    return this;
  },
});

const matchFilter = (doc, filter = {}) => {
  if (filter.email !== undefined && doc.email !== filter.email) return false;
  if (filter.purpose !== undefined && doc.purpose !== filter.purpose) return false;
  if (filter.used !== undefined && doc.used !== filter.used) return false;
  return true;
};

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  delete process.env.REQUIRE_EMAIL_VERIFICATION_ON_LOGIN;
  users.length = 0;
  verifications.length = 0;

  User.findOne = async (query = {}) => {
    if (query.email) {
      return users.find((u) => u.email === query.email) || null;
    }
    if (Array.isArray(query.$or)) {
      const usernameCond = query.$or.find((c) => c.username !== undefined)?.username;
      const emailCond = query.$or.find((c) => c.email !== undefined)?.email;
      return users.find((u) => u.username === usernameCond || u.email === emailCond) || null;
    }
    return null;
  };

  User.findById = async (id) => users.find((u) => u._id === id || u.id === id) || null;

  User.countDocuments = async (query = {}) => {
    if (query.followers !== undefined) {
      return users.filter((u) => (u.followers || []).some((entry) => entry === query.followers || entry?._id === query.followers)).length;
    }
    return 0;
  };

  User.create = async (payload) => {
    const doc = attachUserMethods({
      _id: `u_${Math.random().toString(36).slice(2, 10)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...payload,
    });
    users.push(doc);
    return doc;
  };

  EmailVerification.findOne = async (filter = {}, _projection = null, options = {}) => {
    const list = verifications.filter((v) => matchFilter(v, filter));
    if (!list.length) return null;

    const sort = options?.sort || {};
    if (sort.createdAt === -1) {
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return list[0] || null;
  };

  EmailVerification.updateMany = async (filter, update) => {
    let modifiedCount = 0;
    for (let i = 0; i < verifications.length; i += 1) {
      if (!matchFilter(verifications[i], filter)) continue;
      if (update?.$set) {
        verifications[i] = attachVerificationMethods({ ...verifications[i], ...update.$set });
      }
      modifiedCount += 1;
    }
    return { acknowledged: true, modifiedCount };
  };

  EmailVerification.create = async (payload) => {
    const doc = attachVerificationMethods({
      _id: `v_${Math.random().toString(36).slice(2, 10)}`,
      createdAt: new Date(),
      ...payload,
    });
    verifications.push(doc);
    return doc;
  };

  GamePost.find = () => ({
    populate() { return this; },
    sort: async () => [],
  });

  Player.findOneAndUpdate = async () => ({ _id: '507f1f77bcf86cd799439011' });
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalRequireEmailVerificationOnLogin === undefined) {
    delete process.env.REQUIRE_EMAIL_VERIFICATION_ON_LOGIN;
  } else {
    process.env.REQUIRE_EMAIL_VERIFICATION_ON_LOGIN = originalRequireEmailVerificationOnLogin;
  }
  User.findOne = originalUserFindOne;
  User.findById = originalUserFindById;
  User.create = originalUserCreate;
  User.countDocuments = originalUserCountDocuments;
  EmailVerification.findOne = originalEmailVerificationFindOne;
  EmailVerification.updateMany = originalEmailVerificationUpdateMany;
  EmailVerification.create = originalEmailVerificationCreate;
  GamePost.find = originalGamePostFind;
  Player.findOneAndUpdate = originalPlayerFindOneAndUpdate;
});

describe('Password reset flow with email verification code', () => {
  test('valid email reset code request', async () => {
    const passwordHash = await bcrypt.hash('old-pass-123', 10);
    users.push(attachUserMethods({
      _id: '507f1f77bcf86cd799439001',
      username: 'alice',
      email: 'alice@example.com',
      role: 'Player',
      passwordHash,
    }));

    const result = await resolvers.Mutation.sendPasswordResetCode(null, { email: 'alice@example.com' });

    assert.equal(result.ok, true);
    assert.equal(verifications.length, 1);
    assert.equal(verifications[0].email, 'alice@example.com');
    assert.equal(verifications[0].purpose, 'RESET_PASSWORD');
    assert.equal(verifications[0].used, false);
    assert.ok(verifications[0].codeHash);
    assert.equal(/^\d{6}$/.test(verifications[0].codeHash), false);
  });

  test('non-existing email generic response', async () => {
    const result = await resolvers.Mutation.sendPasswordResetCode(null, { email: 'nobody@example.com' });
    assert.equal(result.ok, true);
    assert.equal(verifications.length, 0);
  });

  test('wrong code rejection', async () => {
    const passwordHash = await bcrypt.hash('old-pass-123', 10);
    users.push(attachUserMethods({
      _id: '507f1f77bcf86cd799439002',
      username: 'bob',
      email: 'bob@example.com',
      role: 'Player',
      passwordHash,
    }));

    const codeHash = await bcrypt.hash('123456', 10);
    verifications.push(
      attachVerificationMethods({
        _id: 'v_wrong',
        email: 'bob@example.com',
        codeHash,
        purpose: 'RESET_PASSWORD',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
        used: false,
        createdAt: new Date(),
      }),
    );

    await assert.rejects(
      () =>
        resolvers.Mutation.resetPasswordWithCode(null, {
          email: 'bob@example.com',
          code: '000000',
          newPassword: 'new-pass-123',
          confirmPassword: 'new-pass-123',
        }),
      /Invalid verification code/,
    );

    assert.equal(verifications[0].attempts, 1);
    assert.equal(verifications[0].used, false);
  });

  test('expired code rejection', async () => {
    const passwordHash = await bcrypt.hash('old-pass-123', 10);
    users.push(attachUserMethods({
      _id: '507f1f77bcf86cd799439003',
      username: 'carl',
      email: 'carl@example.com',
      role: 'Player',
      passwordHash,
    }));

    const codeHash = await bcrypt.hash('123456', 10);
    verifications.push(
      attachVerificationMethods({
        _id: 'v_expired',
        email: 'carl@example.com',
        codeHash,
        purpose: 'RESET_PASSWORD',
        expiresAt: new Date(Date.now() - 1000),
        attempts: 0,
        used: false,
        createdAt: new Date(),
      }),
    );

    await assert.rejects(
      () =>
        resolvers.Mutation.resetPasswordWithCode(null, {
          email: 'carl@example.com',
          code: '123456',
          newPassword: 'new-pass-123',
          confirmPassword: 'new-pass-123',
        }),
      /expired/,
    );

    assert.equal(verifications[0].used, true);
  });

  test('too many attempts rejection', async () => {
    const passwordHash = await bcrypt.hash('old-pass-123', 10);
    users.push(attachUserMethods({
      _id: '507f1f77bcf86cd799439004',
      username: 'dora',
      email: 'dora@example.com',
      role: 'Player',
      passwordHash,
    }));

    const codeHash = await bcrypt.hash('123456', 10);
    verifications.push(
      attachVerificationMethods({
        _id: 'v_attempts',
        email: 'dora@example.com',
        codeHash,
        purpose: 'RESET_PASSWORD',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 5,
        used: false,
        createdAt: new Date(),
      }),
    );

    await assert.rejects(
      () =>
        resolvers.Mutation.resetPasswordWithCode(null, {
          email: 'dora@example.com',
          code: '123456',
          newPassword: 'new-pass-123',
          confirmPassword: 'new-pass-123',
        }),
      /Too many incorrect attempts/,
    );

    assert.equal(verifications[0].used, true);
  });

  test('successful password reset', async () => {
    const oldPasswordHash = await bcrypt.hash('old-pass-123', 10);
    const user = attachUserMethods({
      _id: '507f1f77bcf86cd799439005',
      username: 'emma',
      email: 'emma@example.com',
      role: 'Player',
      passwordHash: oldPasswordHash,
    });
    users.push(user);

    const codeHash = await bcrypt.hash('654321', 10);
    const verification = attachVerificationMethods({
      _id: 'v_success',
      email: 'emma@example.com',
      codeHash,
      purpose: 'RESET_PASSWORD',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
      used: false,
      createdAt: new Date(),
    });
    verifications.push(verification);

    const result = await resolvers.Mutation.resetPasswordWithCode(null, {
      email: 'emma@example.com',
      code: '654321',
      newPassword: 'new-pass-123',
      confirmPassword: 'new-pass-123',
    });

    assert.equal(result, true);
    assert.equal(verification.used, true);
    assert.notEqual(user.passwordHash, oldPasswordHash);
    assert.equal(await bcrypt.compare('new-pass-123', user.passwordHash), true);
  });

  test('login works with new password and old password no longer works', async () => {
    const oldPasswordHash = await bcrypt.hash('old-pass-123', 10);
    const user = attachUserMethods({
      _id: '507f1f77bcf86cd799439006',
      username: 'frank',
      email: 'frank@example.com',
      role: 'Player',
      passwordHash: oldPasswordHash,
    });
    users.push(user);

    const codeHash = await bcrypt.hash('222333', 10);
    verifications.push(
      attachVerificationMethods({
        _id: 'v_login',
        email: 'frank@example.com',
        codeHash,
        purpose: 'RESET_PASSWORD',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
        used: false,
        createdAt: new Date(),
      }),
    );

    await resolvers.Mutation.resetPasswordWithCode(null, {
      email: 'frank@example.com',
      code: '222333',
      newPassword: 'new-pass-123',
      confirmPassword: 'new-pass-123',
    });

    const res = {
      cookie: () => {},
      clearCookie: () => {},
    };

    const oldLogin = await resolvers.Mutation.login(
      null,
      { identifier: 'frank@example.com', password: 'old-pass-123' },
      { res },
    );
    assert.equal(oldLogin.ok, false);

    const newLogin = await resolvers.Mutation.login(
      null,
      { identifier: 'frank@example.com', password: 'new-pass-123' },
      { res },
    );
    assert.equal(newLogin.ok, true);
    assert.ok(newLogin.token);
  });
});

describe('Registration email verification flow', () => {
  test('register creates unverified user and returns auth token', async () => {
    const res = { cookie: () => {}, clearCookie: () => {} };

    const result = await resolvers.Mutation.register(
      null,
      {
        input: {
          username: 'verify_user',
          email: 'verify@example.com',
          password: 'pass-123456',
        },
      },
      { res },
    );

    assert.equal(result.ok, true);
    assert.ok(result.token);
    assert.match(result.message || '', /registration successful/i);

    const created = users.find((u) => u.email === 'verify@example.com');
    assert.ok(created);
    assert.equal(created.emailVerified, false);

    const verification = verifications.find(
      (v) => v.email === 'verify@example.com' && v.purpose === 'VERIFY_EMAIL',
    );
    assert.ok(verification);
    assert.equal(verification.used, false);
  });

  test('login still works when email is not verified', async () => {
    const passwordHash = await bcrypt.hash('pass-123456', 10);
    users.push(
      attachUserMethods({
        _id: '507f1f77bcf86cd799439101',
        username: 'noverify',
        email: 'noverify@example.com',
        role: 'Player',
        emailVerified: false,
        passwordHash,
      }),
    );

    const result = await resolvers.Mutation.login(
      null,
      { identifier: 'noverify@example.com', password: 'pass-123456' },
      { res: { cookie: () => {}, clearCookie: () => {} } },
    );

    assert.equal(result.ok, true);
    assert.ok(result.token);
  });

  test('login is blocked when REQUIRE_EMAIL_VERIFICATION_ON_LOGIN=true', async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION_ON_LOGIN = 'true';

    const passwordHash = await bcrypt.hash('pass-123456', 10);
    users.push(
      attachUserMethods({
        _id: '507f1f77bcf86cd799439103',
        username: 'mustverify',
        email: 'mustverify@example.com',
        role: 'Player',
        emailVerified: false,
        passwordHash,
      }),
    );

    const result = await resolvers.Mutation.login(
      null,
      { identifier: 'mustverify@example.com', password: 'pass-123456' },
      { res: { cookie: () => {}, clearCookie: () => {} } },
    );

    assert.equal(result.ok, false);
    assert.match(result.message || '', /email not verified/i);
  });

  test('verifyEmailCode marks user as verified', async () => {
    const passwordHash = await bcrypt.hash('pass-123456', 10);
    const user = attachUserMethods({
      _id: '507f1f77bcf86cd799439102',
      username: 'verifiable',
      email: 'verifiable@example.com',
      role: 'Player',
      emailVerified: false,
      passwordHash,
    });
    users.push(user);

    const codeHash = await bcrypt.hash('112233', 10);
    verifications.push(
      attachVerificationMethods({
        _id: 'v_verify_email',
        email: 'verifiable@example.com',
        codeHash,
        purpose: 'VERIFY_EMAIL',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
        used: false,
        createdAt: new Date(),
      }),
    );

    const ok = await resolvers.Mutation.verifyEmailCode(
      null,
      { email: 'verifiable@example.com', code: '112233' },
    );

    assert.equal(ok, true);
    assert.equal(user.emailVerified, true);
    assert.ok(user.emailVerifiedAt);
    assert.equal(verifications[0].used, true);
  });

  test('toggleFollowUser follows and returns updated follow state', async () => {
    const current = attachUserMethods({
      _id: '507f1f77bcf86cd799439110',
      username: 'current',
      email: 'current@example.com',
      role: 'Player',
      emailVerified: true,
      followers: [],
      passwordHash: 'hash',
    });
    const target = attachUserMethods({
      _id: '507f1f77bcf86cd799439111',
      username: 'target',
      email: 'target@example.com',
      role: 'Player',
      emailVerified: true,
      followers: [],
      passwordHash: 'hash',
    });
    users.push(current, target);

    const profile = await resolvers.Mutation.toggleFollowUser(
      null,
      { userId: target._id },
      { user: current },
    );

    assert.equal(profile.id, target._id);
    assert.equal(profile.isFollowedByMe, true);
    assert.equal(profile.followerCount, 1);
    assert.equal(target.followers.includes(current._id), true);
  });

  test('toggleFollowUser unfollows when already following', async () => {
    const current = attachUserMethods({
      _id: '507f1f77bcf86cd799439112',
      username: 'current2',
      email: 'current2@example.com',
      role: 'Player',
      emailVerified: true,
      followers: [],
      passwordHash: 'hash',
    });
    const target = attachUserMethods({
      _id: '507f1f77bcf86cd799439113',
      username: 'target2',
      email: 'target2@example.com',
      role: 'Player',
      emailVerified: true,
      followers: [current._id],
      passwordHash: 'hash',
    });
    users.push(current, target);

    const profile = await resolvers.Mutation.toggleFollowUser(
      null,
      { userId: target._id },
      { user: current },
    );

    assert.equal(profile.isFollowedByMe, false);
    assert.equal(profile.followerCount, 0);
    assert.equal(target.followers.includes(current._id), false);
  });
});
