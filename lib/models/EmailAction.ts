import mongoose, { Schema, Model, Types } from 'mongoose';
import crypto from 'crypto';

export type ActionType = 'email_pilot' | 'email_mechanic' | 'cancel_flight' | 'view_details';
export type ActionStatus = 'pending' | 'executed' | 'expired';

export interface IEmailAction {
  _id: mongoose.Types.ObjectId;
  token: string;
  flight: Types.ObjectId;
  actionType: ActionType;
  status: ActionStatus;
  recipientEmail: string;
  targetEmail?: string; // For email actions, the person to be contacted
  targetName?: string;
  customMessage?: string;
  executedAt?: Date;
  executedBy?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const EmailActionSchema = new Schema<IEmailAction>(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    flight: {
      type: Schema.Types.ObjectId,
      ref: 'Flight',
      required: true,
      index: true,
    },
    actionType: {
      type: String,
      enum: ['email_pilot', 'email_mechanic', 'cancel_flight', 'view_details'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'executed', 'expired'],
      default: 'pending',
    },
    recipientEmail: {
      type: String,
      required: true,
    },
    targetEmail: {
      type: String,
    },
    targetName: {
      type: String,
    },
    customMessage: {
      type: String,
    },
    executedAt: {
      type: Date,
    },
    executedBy: {
      type: String,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Generate a secure random token
export function generateActionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Create action tokens for a flight (returns tokens for each action type)
export async function createFlightActionTokens(
  flightId: string | Types.ObjectId,
  ownerEmail: string,
  pilotEmail: string,
  pilotName: string,
  mechanicEmail?: string,
  mechanicName?: string
): Promise<{ emailPilotToken: string; emailMechanicToken?: string }> {
  const EmailAction = mongoose.models.EmailAction || mongoose.model<IEmailAction>('EmailAction', EmailActionSchema);

  // Tokens expire 24 hours after creation
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const emailPilotToken = generateActionToken();

  // Create email pilot action
  await EmailAction.create({
    token: emailPilotToken,
    flight: flightId,
    actionType: 'email_pilot',
    status: 'pending',
    recipientEmail: ownerEmail,
    targetEmail: pilotEmail,
    targetName: pilotName,
    expiresAt,
  });

  let emailMechanicToken: string | undefined;

  // Create email mechanic action if mechanic info provided
  if (mechanicEmail) {
    emailMechanicToken = generateActionToken();
    await EmailAction.create({
      token: emailMechanicToken,
      flight: flightId,
      actionType: 'email_mechanic',
      status: 'pending',
      recipientEmail: ownerEmail,
      targetEmail: mechanicEmail,
      targetName: mechanicName || 'Mechanic',
      expiresAt,
    });
  }

  return { emailPilotToken, emailMechanicToken };
}

// Prevent model recompilation in Next.js dev mode
const EmailAction: Model<IEmailAction> = mongoose.models.EmailAction || mongoose.model<IEmailAction>('EmailAction', EmailActionSchema);

export default EmailAction;
