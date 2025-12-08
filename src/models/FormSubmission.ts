import mongoose, { Document, Schema, Model } from 'mongoose';

// ============================================
// INTERFACES & TYPES
// ============================================

export interface IFileUpload {
    fieldId: string;
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
    uploadedAt: Date;
}

export interface IFormSubmission extends Document {
    templateId: mongoose.Types.ObjectId;
    projectId: mongoose.Types.ObjectId;
    data: Map<string, Map<string, any>>;
    submittedBy?: mongoose.Types.ObjectId;
    respondentEmail?: string;
    respondentName?: string;
    ipAddress?: string;
    userAgent?: string;
    startedAt?: Date;
    completedAt: Date;
    timeToComplete?: number;
    fileUploads?: IFileUpload[];
    status: 'draft' | 'completed' | 'abandoned';
    deviceType?: 'desktop' | 'mobile' | 'tablet';
    createdAt: Date;
    updatedAt: Date;
}

// ============================================
// MONGOOSE SCHEMA
// ============================================

const fileUploadSchema = new Schema<IFileUpload>({
    fieldId: { type: String, required: true },
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    fileSize: { type: Number, required: true },
    mimeType: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now }
}, { _id: false });

const formSubmissionSchema = new Schema<IFormSubmission>(
    {
        templateId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FormTemplate',
            required: true,
            index: true
        },
        projectId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Project',
            required: true,
            index: true
        },
        data: {
            type: Map,
            of: Map,
            required: true
        },
        submittedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            index: true
        },
        respondentEmail: {
            type: String,
            trim: true,
            lowercase: true,
            index: true
        },
        respondentName: {
            type: String,
            trim: true
        },
        ipAddress: { type: String },
        userAgent: { type: String },
        startedAt: { type: Date },
        completedAt: {
            type: Date,
            required: true,
            index: true
        },
        timeToComplete: { type: Number },
        fileUploads: [fileUploadSchema],
        status: {
            type: String,
            enum: ['draft', 'completed', 'abandoned'],
            default: 'completed',
            required: true,
            index: true
        },
        deviceType: {
            type: String,
            enum: ['desktop', 'mobile', 'tablet']
        }
    },
    {
        timestamps: true
    }
);

// Indexes
formSubmissionSchema.index({ templateId: 1, completedAt: -1 });
formSubmissionSchema.index({ projectId: 1, status: 1, completedAt: -1 });

// Calculate time to complete
formSubmissionSchema.pre('save', function (next) {
    if (this.isNew && this.startedAt && this.completedAt && !this.timeToComplete) {
        this.timeToComplete = Math.round(
            (this.completedAt.getTime() - this.startedAt.getTime()) / 1000
        );
    }
    next();
});

// Detect device type
formSubmissionSchema.pre('save', function (next) {
    if (!this.deviceType && this.userAgent) {
        const ua = this.userAgent.toLowerCase();
        if (/mobile|android|iphone/.test(ua)) {
            this.deviceType = 'mobile';
        } else if (/tablet|ipad/.test(ua)) {
            this.deviceType = 'tablet';
        } else {
            this.deviceType = 'desktop';
        }
    }
    next();
});

const FormSubmission: Model<IFormSubmission> = mongoose.model<IFormSubmission>('FormSubmission', formSubmissionSchema);

export default FormSubmission;
