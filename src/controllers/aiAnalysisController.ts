import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import { generateOverviewAnalysis } from '../services/aiAnalysisService';
import projectService from '../services/projectService';

export const generateOverview = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId, metrics, forceRegenerate } = req.body;

  if (!projectId) {
    res.status(400).json({
      success: false,
      error: 'Project ID is required',
    });
    return;
  }

  try {
    // @ts-ignore
    const userId = req.user._id.toString();

    // Verify project belongs to user
    const project = await projectService.getProjectById(projectId, userId);
    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    console.log(`[AI Analysis Controller] Generating analysis for project: ${project.name}`);

    const result = await generateOverviewAnalysis(
      projectId,
      {
        projectName: project.name,
        ...metrics,
      },
      forceRegenerate === true
    );

    res.status(200).json({
      success: true,
      data: {
        analysis: result.analysis,
        fromCache: result.fromCache,
        generatedAt: result.generatedAt,
      },
    });
  } catch (error: any) {
    console.error('[AI Analysis Controller] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate analysis',
    });
  }
});

