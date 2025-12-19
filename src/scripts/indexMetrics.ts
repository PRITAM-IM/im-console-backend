/**
 * Index Metrics Script
 * Batch indexing script to index project metrics into Pinecone vector database
 * Run this script periodically or on-demand to keep vector database up-to-date
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import metricsAggregator from '../services/metricsAggregator';
import ragService from '../services/ragService';
import { ENV } from '../config/env';
import { initializePineconeIndex } from '../config/pinecone';

// Load environment variables
dotenv.config();

/**
 * Main indexing function
 */
async function indexProjectMetrics(
  projectId: string,
  startDate: string,
  endDate: string
): Promise<void> {
  console.log(`\n🔮 Starting metrics indexing for project ${projectId}`);
  console.log(`📅 Date range: ${startDate} to ${endDate}`);

  try {
    // Fetch aggregated metrics
    console.log('📊 Fetching aggregated metrics...');
    const metrics = await metricsAggregator.getProjectMetrics(projectId, startDate, endDate);

    // Index metrics into Pinecone
    console.log('🚀 Indexing metrics into Pinecone...');
    await ragService.indexMetrics(metrics, projectId);

    console.log('✅ Metrics indexing completed successfully!');
  } catch (error) {
    console.error('❌ Error indexing metrics:', error);
    throw error;
  }
}

/**
 * Index all active projects
 */
async function indexAllProjects(startDate: string, endDate: string): Promise<void> {
  console.log('\n🔮 Starting batch indexing for all projects');
  
  try {
    // Import Project model dynamically to avoid circular dependencies
    const ProjectModel = (await import('../models/Project')).default;
    
    // Fetch all active projects
    const projects = await ProjectModel.find({}).select('_id name');
    console.log(`📊 Found ${projects.length} active projects`);

    // Index each project
    for (const project of projects) {
      try {
        console.log(`\n--- Indexing ${project.name} (${project._id}) ---`);
        await indexProjectMetrics(project._id.toString(), startDate, endDate);
      } catch (error) {
        console.error(`❌ Failed to index project ${project.name}:`, error);
        // Continue with next project
      }
    }

    console.log('\n✅ Batch indexing completed!');
  } catch (error) {
    console.error('❌ Error in batch indexing:', error);
    throw error;
  }
}

/**
 * CLI Entry Point
 */
async function main() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(ENV.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Initialize Pinecone
    console.log('🔌 Initializing Pinecone...');
    await initializePineconeIndex();
    console.log('✅ Pinecone initialized');

    // Parse command line arguments
    const args = process.argv.slice(2);
    const command = args[0];

    if (command === 'project') {
      // Index a specific project
      const projectId = args[1];
      const startDate = args[2];
      const endDate = args[3];

      if (!projectId || !startDate || !endDate) {
        console.error('Usage: npm run index-metrics project <projectId> <startDate> <endDate>');
        console.error('Example: npm run index-metrics project 507f1f77bcf86cd799439011 2025-01-01 2025-01-31');
        process.exit(1);
      }

      await indexProjectMetrics(projectId, startDate, endDate);
    } else if (command === 'all') {
      // Index all projects
      const startDate = args[1];
      const endDate = args[2];

      if (!startDate || !endDate) {
        console.error('Usage: npm run index-metrics all <startDate> <endDate>');
        console.error('Example: npm run index-metrics all 2025-01-01 2025-01-31');
        process.exit(1);
      }

      await indexAllProjects(startDate, endDate);
    } else {
      console.error('Invalid command. Use "project" or "all"');
      console.error('Usage:');
      console.error('  npm run index-metrics project <projectId> <startDate> <endDate>');
      console.error('  npm run index-metrics all <startDate> <endDate>');
      process.exit(1);
    }

    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the script
main();
