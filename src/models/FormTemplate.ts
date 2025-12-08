import mongoose, { Document, Schema, Model } from 'mongoose';

// ============================================
// INTERFACES & TYPES
// ============================================

export interface IConditionalLogic {
    id: string;
    triggerFieldId: string;
    triggerCondition:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'greater_than'
    | 'less_than'
    | 'is_empty'
    | 'is_not_empty';
    triggerValue?: any;
    action: 'show' | 'hide' | 'require' | 'skip_to_page';
    targetFieldIds?: string[];
    targetPageId?: string;
}

export interface IFieldOption {
    id: string;
    label: string;
    value: string;
    imageUrl?: string;
}

export interface IFieldValidation {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
    fileTypes?: string[];
    maxFileSize?: number;
}

export interface IFormField {
    id: string;
    type: string;
    label: string;
    labelTemplate?: string;
    placeholder?: string;
    description?: string;
    descriptionTemplate?: string;
    options?: IFieldOption[];
    validation?: IFieldValidation;
    conditionalLogic?: IConditionalLogic[];
    defaultValue?: any;
    order: number;
}

export interface IFormPage {
    id: string;
    name: string;
    description?: string;
    fields: IFormField[];
    order: number;
    conditionalLogic?: IConditionalLogic[];
}

export interface IFormCoverPage {
    title: string;
    description?: string;
    imageUrl?: string;
    showCover: boolean;
}

export interface IFormTheme {
    accentColor: string;
    mode: 'light' | 'dark';
    fontFamily?: string;
}

export interface IFormTemplate extends Document {
    projectId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    name: string;
    description?: string;
    slug: string;
    pages: IFormPage[];
    coverPage: IFormCoverPage;
    theme: IFormTheme;
    isPublished: boolean;
    publishedUrl?: string;
    publishedAt?: Date;
    isCpsTemplate?: boolean;
    viewCount: number;
    submissionCount: number;
    createdAt: Date;
    updatedAt: Date;
    createdBy: mongoose.Types.ObjectId;
}

// ============================================
// MONGOOSE SCHEMAS
// ============================================

const conditionalLogicSchema = new Schema<IConditionalLogic>({
    id: { type: String, required: true },
    triggerFieldId: { type: String, required: true },
    triggerCondition: {
        type: String,
        enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'is_empty', 'is_not_empty'],
        required: true
    },
    triggerValue: { type: Schema.Types.Mixed },
    action: {
        type: String,
        enum: ['show', 'hide', 'require', 'skip_to_page'],
        required: true
    },
    targetFieldIds: [{ type: String }],
    targetPageId: { type: String }
}, { _id: false });

const fieldOptionSchema = new Schema<IFieldOption>({
    id: { type: String, required: true },
    label: { type: String, required: true },
    value: { type: String, required: true },
    imageUrl: { type: String }
}, { _id: false });

const fieldValidationSchema = new Schema<IFieldValidation>({
    required: { type: Boolean },
    minLength: { type: Number },
    maxLength: { type: Number },
    min: { type: Number },
    max: { type: Number },
    pattern: { type: String },
    fileTypes: [{ type: String }],
    maxFileSize: { type: Number }
}, { _id: false });

const formFieldSchema = new Schema<IFormField>({
    id: { type: String, required: true },
    type: { type: String, required: true },
    label: { type: String, required: true },
    labelTemplate: { type: String },
    placeholder: { type: String },
    description: { type: String },
    descriptionTemplate: { type: String },
    options: [fieldOptionSchema],
    validation: fieldValidationSchema,
    conditionalLogic: [conditionalLogicSchema],
    defaultValue: { type: Schema.Types.Mixed },
    order: { type: Number, required: true }
}, { _id: false });

const formPageSchema = new Schema<IFormPage>({
    id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String },
    fields: [formFieldSchema],
    order: { type: Number, required: true },
    conditionalLogic: [conditionalLogicSchema]
}, { _id: false });

const formTemplateSchema = new Schema<IFormTemplate>(
    {
        projectId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Project',
            required: true,
            index: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String,
            trim: true
        },
        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true
        },
        pages: {
            type: [formPageSchema],
            required: true,
            validate: {
                validator: function (pages: IFormPage[]) {
                    return pages.length > 0;
                },
                message: 'Form must have at least one page'
            }
        },
        coverPage: {
            title: { type: String, required: true },
            description: { type: String },
            imageUrl: { type: String },
            showCover: { type: Boolean, default: false }
        },
        theme: {
            accentColor: { type: String, default: '#f97316' },
            mode: { type: String, enum: ['light', 'dark'], default: 'light' },
            fontFamily: { type: String }
        },
        isPublished: {
            type: Boolean,
            default: false,
            index: true
        },
        publishedUrl: { type: String },
        publishedAt: { type: Date },
        isCpsTemplate: { type: Boolean, default: false },
        viewCount: { type: Number, default: 0 },
        submissionCount: { type: Number, default: 0 },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        }
    },
    {
        timestamps: true
    }
);

// Indexes
formTemplateSchema.index({ projectId: 1, createdAt: -1 });
formTemplateSchema.index({ userId: 1, isPublished: 1 });
formTemplateSchema.index({ slug: 1 }, { unique: true });

// Generate slug before save
formTemplateSchema.pre('save', async function (next) {
    if (!this.slug || this.isModified('name')) {
        const baseSlug = this.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        let slug = baseSlug;
        let counter = 1;

        while (await mongoose.models.FormTemplate?.findOne({ slug, _id: { $ne: this._id } })) {
            slug = `${baseSlug}-${counter}`;
            counter++;
        }

        this.slug = slug;
    }

    next();
});

// Set publishedAt when publishing
formTemplateSchema.pre('save', function (next) {
    if (this.isModified('isPublished') && this.isPublished && !this.publishedAt) {
        this.publishedAt = new Date();
        this.publishedUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/forms/${this.slug}`;
    }
    next();
});

const FormTemplate: Model<IFormTemplate> = mongoose.model<IFormTemplate>('FormTemplate', formTemplateSchema);

export default FormTemplate;
