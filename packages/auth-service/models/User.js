// graphql-server/models/User.js
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * User
 * - 系统用户，支持玩家和管理员角色
 */
const userSchema = new Schema(
  {
    username:             { type: String, required: true, unique: true, index: true },
    email:                { type: String, required: true, unique: true, index: true },
    passwordHash:         { type: String, required: true },
    role:                 { type: String, enum: ['Admin', 'Player'], default: 'Player' },
    resetPasswordToken:   { type: String, default: undefined },
    resetPasswordExpires: { type: Date,   default: undefined },
  },
  {
    timestamps: true,
    collection: 'users',
  }
);

/* ----------------------------- 中间件 ----------------------------- */
// 保存前规范化用户名
userSchema.pre('save', function (next) {
  if (this.isModified('username') && typeof this.username === 'string') {
    this.username = this.username.trim();
  }
  next();
});

/* ----------------------------- 实例方法/静态方法（可扩展） ----------------------------- */
// 预留：如添加游戏、移除游戏等

export default model('User', userSchema);

// This file defines the User model for a GraphQL server using Mongoose.