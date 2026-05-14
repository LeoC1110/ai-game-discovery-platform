import mongoose from 'mongoose';

const { Schema } = mongoose;

const TournamentResultSchema = new Schema(
  {
    tournament: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    game: { type: Schema.Types.ObjectId, ref: 'Game' },
    score: { type: Number, required: true },
    position: { type: Number },
    notes: { type: String, trim: true },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    submittedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

TournamentResultSchema.index({ tournament: 1, score: -1 });
TournamentResultSchema.index({ game: 1, score: -1 });
TournamentResultSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('TournamentResult', TournamentResultSchema);
