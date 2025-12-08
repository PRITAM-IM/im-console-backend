import express, { Request, Response } from 'express';
import FormTemplate from '../models/FormTemplate';
import FormSubmission from '../models/FormSubmission';
import { authenticate as authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

// ============================================
// FORM TEMPLATE ROUTES
// ============================================

// Get all forms for a project
router.get('/projects/:projectId/forms', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;
        const userId = (req as any).user?.userId;

        const forms = await FormTemplate.find({ projectId, userId })
            .sort({ createdAt: -1 })
            .select('-__v');

        res.json(forms);
    } catch (error: any) {
        console.error('Error fetching forms:', error);
        res.status(500).json({ error: 'Failed to fetch forms', message: error.message });
    }
});

// Get single form by ID
router.get('/projects/:projectId/forms/:formId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { projectId, formId } = req.params;
        const userId = (req as any).user?.userId;

        const form = await FormTemplate.findOne({
            _id: formId,
            projectId,
            userId
        }).select('-__v');

        if (!form) {
            res.status(404).json({ error: 'Form not found' });
            return;
        }

        res.json(form);
    } catch (error: any) {
        console.error('Error fetching form:', error);
        res.status(500).json({ error: 'Failed to fetch form', message: error.message });
    }
});

// Create new form
router.post('/projects/:projectId/forms', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;
        const userId = (req as any).user?.userId;
        const formData = req.body;

        const newForm = new FormTemplate({
            ...formData,
            projectId,
            userId,
            createdBy: userId
        });

        await newForm.save();
        res.status(201).json(newForm);
    } catch (error: any) {
        console.error('Error creating form:', error);
        res.status(500).json({ error: 'Failed to create form', message: error.message });
    }
});

// Update form
router.put('/projects/:projectId/forms/:formId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { projectId, formId } = req.params;
        const userId = (req as any).user?.userId;
        const updates = req.body;

        const form = await FormTemplate.findOneAndUpdate(
            { _id: formId, projectId, userId },
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!form) {
            return res.status(404).json({ error: 'Form not found' });
        }

        res.json(form);
    } catch (error: any) {
        console.error('Error updating form:', error);
        res.status(500).json({ error: 'Failed to update form', message: error.message });
    }
});

// Delete form
router.delete('/projects/:projectId/forms/:formId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { projectId, formId } = req.params;
        const userId = (req as any).user?.userId;

        const form = await FormTemplate.findOneAndDelete({
            _id: formId,
            projectId,
            userId
        });

        if (!form) {
            return res.status(404).json({ error: 'Form not found' });
        }

        // Also delete all submissions for this form
        await FormSubmission.deleteMany({ templateId: formId });

        res.json({ message: 'Form deleted successfully' });
    } catch (error: any) {
        console.error('Error deleting form:', error);
        res.status(500).json({ error: 'Failed to delete form', message: error.message });
    }
});

// Publish/Unpublish form
router.patch('/projects/:projectId/forms/:formId/publish', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { projectId, formId } = req.params;
        const userId = (req as any).user?.userId;
        const { isPublished } = req.body;

        const form = await FormTemplate.findOneAndUpdate(
            { _id: formId, projectId, userId },
            { $set: { isPublished } },
            { new: true }
        );

        if (!form) {
            return res.status(404).json({ error: 'Form not found' });
        }

        res.json(form);
    } catch (error: any) {
        console.error('Error publishing form:', error);
        res.status(500).json({ error: 'Failed to publish form', message: error.message });
    }
});

// Duplicate form
router.post('/projects/:projectId/forms/:formId/duplicate', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { projectId, formId } = req.params;
        const userId = (req as any).user?.userId;

        const originalForm = await FormTemplate.findOne({
            _id: formId,
            projectId,
            userId
        });

        if (!originalForm) {
            res.status(404).json({ error: 'Form not found' });
            return;
        }

        const duplicateData = originalForm.toObject();
        const { _id, createdAt, updatedAt, slug, ...cleanData } = duplicateData;

        const newForm = new FormTemplate({
            ...cleanData,
            name: `${originalForm.name} (Copy)`,
            isPublished: false,
            publishedUrl: undefined,
            publishedAt: undefined,
            viewCount: 0,
            submissionCount: 0
        });

        await newForm.save();
        res.status(201).json(newForm);
    } catch (error: any) {
        console.error('Error duplicating form:', error);
        res.status(500).json({ error: 'Failed to duplicate form', message: error.message });
    }
});

// ============================================
// PUBLIC FORM ROUTES (No Auth Required)
// ============================================

// Get published form by slug
router.get('/forms/:slug', async (req: Request, res: Response) => {
    try {
        const { slug } = req.params;

        const form = await FormTemplate.findOne({
            slug,
            isPublished: true
        }).select('-__v');

        if (!form) {
            return res.status(404).json({ error: 'Form not found' });
        }

        // Increment view count
        form.viewCount += 1;
        await form.save();

        res.json(form);
    } catch (error: any) {
        console.error('Error fetching public form:', error);
        res.status(500).json({ error: 'Failed to fetch form', message: error.message });
    }
});

// ============================================
// FORM SUBMISSION ROUTES
// ============================================

// Get all submissions for a form
router.get('/projects/:projectId/forms/:formId/submissions', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { projectId, formId } = req.params;
        const userId = (req as any).user?.userId;

        const { status, limit = 50, skip = 0 } = req.query;

        // Verify user owns this form
        const form = await FormTemplate.findOne({ _id: formId, projectId, userId });
        if (!form) {
            return res.status(404).json({ error: 'Form not found' });
        }

        const query: any = { templateId: formId, projectId };
        if (status) {
            query.status = status;
        }

        const submissions = await FormSubmission.find(query)
            .sort({ completedAt: -1 })
            .limit(Number(limit))
            .skip(Number(skip))
            .select('-__v');

        const total = await FormSubmission.countDocuments(query);

        res.json({ submissions, total, limit: Number(limit), skip: Number(skip) });
    } catch (error: any) {
        console.error('Error fetching submissions:', error);
        res.status(500).json({ error: 'Failed to fetch submissions', message: error.message });
    }
});

// Get single submission
router.get('/projects/:projectId/forms/:formId/submissions/:submissionId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { projectId, formId, submissionId } = req.params;
        const userId = (req as any).user?.userId;

        // Verify user owns this form
        const form = await FormTemplate.findOne({ _id: formId, projectId, userId });
        if (!form) {
            return res.status(404).json({ error: 'Form not found' });
        }

        const submission = await FormSubmission.findOne({
            _id: submissionId,
            templateId: formId
        }).select('-__v');

        if (!submission) {
            return res.status(404).json({ error: 'Submission not found' });
        }

        res.json(submission);
    } catch (error: any) {
        console.error('Error fetching submission:', error);
        res.status(500).json({ error: 'Failed to fetch submission', message: error.message });
    }
});

// Submit form (public endpoint)
router.post('/forms/:slug/submit', async (req: Request, res: Response) => {
    try {
        const { slug } = req.params;
        const submissionData = req.body;

        // Find the published form
        const form = await FormTemplate.findOne({ slug, isPublished: true });
        if (!form) {
            res.status(404).json({ error: 'Form not found or not published' });
            return;
        }

        // Create submission
        const submission = new FormSubmission({
            templateId: form._id,
            projectId: form.projectId,
            data: submissionData.data,
            respondentEmail: submissionData.respondentEmail,
            respondentName: submissionData.respondentName,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            startedAt: submissionData.startedAt ? new Date(submissionData.startedAt) : new Date(),
            completedAt: new Date(),
            status: 'completed'
        });

        await submission.save();

        // Increment submission count
        form.submissionCount += 1;
        await form.save();

        res.status(201).json({
            message: 'Submission received successfully',
            submissionId: submission._id
        });
    } catch (error: any) {
        console.error('Error submitting form:', error);
        res.status(500).json({ error: 'Failed to submit form', message: error.message });
    }
});

// Delete submission
router.delete('/projects/:projectId/forms/:formId/submissions/:submissionId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { projectId, formId, submissionId } = req.params;
        const userId = (req as any).user?.userId;

        // Verify user owns this form
        const form = await FormTemplate.findOne({ _id: formId, projectId, userId });
        if (!form) {
            return res.status(404).json({ error: 'Form not found' });
        }

        const submission = await FormSubmission.findOneAndDelete({
            _id: submissionId,
            templateId: formId
        });

        if (!submission) {
            return res.status(404).json({ error: 'Submission not found' });
        }

        // Decrement submission count
        form.submissionCount = Math.max(0, form.submissionCount - 1);
        await form.save();

        res.json({ message: 'Submission deleted successfully' });
    } catch (error: any) {
        console.error('Error deleting submission:', error);
        res.status(500).json({ error: 'Failed to delete submission', message: error.message });
    }
});

export default router;
