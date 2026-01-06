/**
 * Migration script to extract respondent email and name from existing form submissions
 * Run this script once to fix existing submissions that have email/name in the data field
 * but not in the top-level respondentEmail/respondentName fields
 */

import mongoose from 'mongoose';
import FormSubmission from '../models/FormSubmission';
import FormTemplate from '../models/FormTemplate';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hotel-analytics';

async function migrateSubmissions() {
    try {
        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Get all submissions that don't have respondentEmail or respondentName
        const submissions = await FormSubmission.find({
            $or: [
                { respondentEmail: { $exists: false } },
                { respondentEmail: null },
                { respondentEmail: '' },
                { respondentName: { $exists: false } },
                { respondentName: null },
                { respondentName: '' }
            ]
        });

        console.log(`📊 Found ${submissions.length} submissions to process`);

        let updatedCount = 0;

        for (const submission of submissions) {
            let updated = false;
            let respondentEmail: string | undefined;
            let respondentName: string | undefined;

            // Get the form template to understand field types
            const template = await FormTemplate.findById(submission.templateId);

            if (!template) {
                console.log(`⚠️  Template not found for submission ${submission._id}`);
                continue;
            }

            // Extract data from submission
            const submissionData = submission.data;

            // Iterate through pages
            template.pages.forEach((page: any) => {
                const pageId = page.id;
                const pageData = submissionData.get(pageId);

                if (!pageData) return;

                // Iterate through fields to find email and name
                page.fields.forEach((field: any) => {
                    const fieldValue = pageData.get(field.id);

                    if (!fieldValue) return;

                    // Extract email from email-type fields
                    if (field.type === 'email' && !respondentEmail) {
                        respondentEmail = fieldValue;
                    }

                    // Extract name from name-related fields
                    if (!respondentName) {
                        const label = (field.label || '').toLowerCase();
                        const fieldId = (field.id || '').toLowerCase();

                        if (
                            label.includes('name') ||
                            label.includes('username') ||
                            label.includes('full name') ||
                            label.includes('your name') ||
                            fieldId.includes('name')
                        ) {
                            respondentName = fieldValue;
                        }
                        // If it's a short text field and we don't have a name yet,
                        // and it's not an email, use it as name
                        else if (
                            !respondentName &&
                            (field.type === 'short_answer' || field.type === 'short-text') &&
                            field.type !== 'email' &&
                            typeof fieldValue === 'string' &&
                            fieldValue.length > 0 &&
                            fieldValue.length < 100 &&
                            !fieldValue.includes('@')
                        ) {
                            respondentName = fieldValue;
                        }
                    }
                });
            });

            // Update submission if we found email or name
            if (respondentEmail || respondentName) {
                const updateData: any = {};
                if (respondentEmail) updateData.respondentEmail = respondentEmail;
                if (respondentName) updateData.respondentName = respondentName;

                await FormSubmission.updateOne(
                    { _id: submission._id },
                    { $set: updateData }
                );

                updatedCount++;
                console.log(`✅ Updated submission ${submission._id}: name="${respondentName}", email="${respondentEmail}"`);
                updated = true;
            }

            if (!updated) {
                console.log(`ℹ️  No email/name found in submission ${submission._id}`);
            }
        }

        console.log(`\n✨ Migration complete!`);
        console.log(`📊 Total submissions processed: ${submissions.length}`);
        console.log(`✅ Submissions updated: ${updatedCount}`);

    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Disconnected from MongoDB');
    }
}

// Run migration
migrateSubmissions();
