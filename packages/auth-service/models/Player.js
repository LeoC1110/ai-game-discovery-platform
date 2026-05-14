import mongoose from 'mongoose';

const { Schema } = mongoose;

const PlayerSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    nickname: { type: String, trim: true },
  },
  { timestamps: true },
);

export default mongoose.model('Player', PlayerSchema);
