/**
 * Batch Indexing Script
 * Indexes all projects' metrics to Pinecone vector database
 * 
 * Usage:
 * npx ts-node src/scripts/indexMetrics.ts
 * 
 * Or with custom date range:
 * npx ts-node src/scripts/indexMetrics.ts --days=30
 */

import mongoose from 'mongoose';
import { ENV } from '../config/env';
import Project from '../models/Project';
import metricsAggregator from '../services/metricsAggregator';
import ragService from '../services/ragService';
import { initializePineconeIndex } from '../config/pinecone';

// Parse command line arguments
const args = process.argv.slice(2);
const daysArg = args.find(arg => arg.startsWith('--days='));
const days = daysArg ? parseInt(daysArg.split('=')[1], 10) : 30;

/**
 * Calculate date range (last N days excluding today)
 */
function getDateRange(days: number): { startDate: string; endDate: string } {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const endDate = yesterday.toISOString().split('T')[0];

  const startDateObj = new Date(yesterday);
  startDateObj.setDate(startDateObj.getDate() - (days - 1));
  const startDate = startDateObj.toISOString().split('T')[0];

  return { startDate, endDate };
}

/**
 * Index a single project
 */
async function indexProject(project: any, startDate: string, endDate: string): Promise<boolean> {
  try {
    console.log(`\n📊 Indexing project: ${project.name} (${project._id})`);
    console.log(`   Date range: ${startDate} to ${endDate}`);

    // Fetch metrics
    const metrics = await metricsAggregator.getProjectMetrics(
      project._id.toString(),
      startDate,
      endDate
    );

    // Check if project has any data
    if (metrics.trafficMetrics.sessions === 0 && metrics.conversionMetrics.conversions === 0) {
      console.log(`   ⚠️  No data available for this project, skipping...`);
      return false;
    }

    // Index to vector database
    await ragService.reindexProject(metrics, project._id.toString());

    console.log(`   ✅ Successfully indexed project`);
    return true;
  } catch (error: any) {
    console.error(`   ❌ Error indexing project:`, error.message);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║      BATCH INDEXING SCRIPT - Pinecone Vector Database     ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(ENV.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Initialize Pinecone index
    console.log('🔌 Initializing Pinecone index...');
    await initializePineconeIndex();
    console.log('✅ Pinecone index ready\n');

    // Calculate date range
    const { startDate, endDate } = getDateRange(days);
    console.log(`📅 Date Range: Last ${days} days (${startDate} to ${endDate})\n`);

    // Fetch all projects
    console.log('🔍 Fetching all projects...');
    const projects = await Project.find({}).select('_id name gaPropertyId');
    console.log(`✅ Found ${projects.length} projects\n`);

    if (projects.length === 0) {
      console.log('⚠️  No projects found in database. Exiting...');
      return;
    }

    // Index each project
    console.log('🚀 Starting batch indexing...\n');
    console.log('─'.repeat(60));

    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];
      console.log(`\n[${i + 1}/${projects.length}]`);

      // Check if project has GA property
      if (!project.gaPropertyId) {
        console.log(`📊 Project: ${project.name} (${project._id})`);
        console.log(`   ⚠️  No Google Analytics property connected, skipping...`);
        skippedCount++;
        continue;
      }

      const success = await indexProject(project, startDate, endDate);
      
      if (success) {
        successCount++;
      } else {
        // Could be skipped due to no data or failed
        if (success === false) {
          skippedCount++;
        } else {
          failureCount++;
        }
      }

      // Small delay between projects to avoid rate limits
      if (i < projects.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Summary
    console.log('\n' + '─'.repeat(60));
    console.log('\n📊 INDEXING SUMMARY:');
    console.log(`   Total Projects: ${projects.length}`);
    console.log(`   ✅ Successfully Indexed: ${successCount}`);
    console.log(`   ⚠️  Skipped (No GA or No Data): ${skippedCount}`);
    console.log(`   ❌ Failed: ${failureCount}`);
    console.log('\n✅ Batch indexing completed!\n');

  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
main()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
