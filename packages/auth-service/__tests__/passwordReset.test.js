import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

import { resolvers } from '../graphql/resolvers.js';
import User from '../models/User.js';
import EmailVerification from '../models/EmailVerification.js';
import Player from '../models/Player.js';

const originalUserFindOne = User.findOne;
const originalEmailVerificationFindOne = EmailVerification.findOne;
const originalEmailVerificationUpdateMany = EmailVerification.updateMany;
const originalEmailVerificationCreate = EmailVerification.create;
const originalPlayerFindOneAndUpdate = Player.findOneAndUpdate;

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

  Player.findOneAndUpdate = async () => ({ _id: '507f1f77bcf86cd799439011' });
});

afterEach(() => {
  User.findOne = originalUserFindOne;
  EmailVerification.findOne = originalEmailVerificationFindOne;
  EmailVerification.updateMany = originalEmailVerificationUpdateMany;
  EmailVerification.create = originalEmailVerificationCreate;
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
