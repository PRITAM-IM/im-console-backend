import mongoose, { Document, Schema } from 'mongoose';

export interface IBalanceAlert extends Document {
    projectId: mongoose.Types.ObjectId;
    projectName: string;
    balance: number;
    currency: string;
    threshold: number;
    alertSentAt: Date;
    whatsappGroupId?: string;
    messageId?: string;
    status: 'sent' | 'failed';
    errorMessage?: string;
    createdAt: Date;
    updatedAt: Date;
}

const balanceAlertSchema = new Schema<IBalanceAlert>(
    {
        projectId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Project',
            required: true,
            index: true,
        },
        projectName: {
            type: String,
            required: true,
        },
        balance: {
            type: Number,
            required: true,
        },
        currency: {
            type: String,
            default: 'INR',
        },
        threshold: {
            type: Number,
            required: true,
        },
        alertSentAt: {
            type: Date,
            required: true,
            default: Date.now,
        },
        whatsappGroupId: {
            type: String,
        },
        messageId: {
            type: String,
        },
        status: {
            type: String,
            enum: ['sent', 'failed'],
            default: 'sent',
        },
        errorMessage: {
            type: String,
        },
    },
    {
        timestamps: true,
    }
);

// Index for querying recent alerts
balanceAlertSchema.index({ projectId: 1, alertSentAt: -1 });

const BalanceAlert = mongoose.model<IBalanceAlert>('BalanceAlert', balanceAlertSchema);

export default BalanceAlert;
