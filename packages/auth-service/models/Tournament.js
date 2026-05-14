import mongoose from 'mongoose';

const { Schema } = mongoose;

const STATUS_TYPES = ['Upcoming', 'Ongoing', 'Completed'];
const LAUNCH_TYPES = ['Local', 'ExternalLink', 'Embeddable'];

const TournamentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    game: { type: String, required: true, trim: true },
    gameRef: { type: Schema.Types.ObjectId, ref: 'Game' },
    date: { type: Date },
    status: {
      type: String,
      enum: STATUS_TYPES,
      default: 'Upcoming',
      index: true,
    },
    launchType: {
      type: String,
      enum: LAUNCH_TYPES,
      default: 'Local',
    },
    launchUrl: { type: String, trim: true },
    embedUrl: { type: String, trim: true },
    rules: { type: String, trim: true },
    scoreRules: { type: String, trim: true },
    prizePool: { type: String, trim: true },
    players: [{ type: Schema.Types.ObjectId, ref: 'Player' }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

TournamentSchema.index({ status: 1, date: 1 });
TournamentSchema.index({ gameRef: 1 });

export default mongoose.model('Tournament', TournamentSchema);
