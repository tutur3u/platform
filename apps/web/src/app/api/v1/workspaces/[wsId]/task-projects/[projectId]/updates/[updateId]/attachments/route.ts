import { randomUUID } from 'node:crypto';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ wsId: string; projectId: string; updateId: string }>;
  }
) {
  try {
    const { wsId, projectId, updateId } = await params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify the update belongs to the specified project and workspace
    const { data: updateRecord, error: updateError } = await supabase
      .from('task_project_updates')
      .select('id, project_id')
      .eq('id', updateId)
      .single();

    if (updateError || !updateRecord) {
      return NextResponse.json({ error: 'Update not found' }, { status: 404 });
    }

    // Verify the update's project matches the specified projectId
    if (updateRecord.project_id !== projectId) {
      return NextResponse.json(
        { error: 'Update does not belong to the specified project' },
        { status: 403 }
      );
    }

    // Verify the project belongs to the specified workspace
    const { data: projectRecord, error: projectError } = await supabase
      .from('task_projects')
      .select('ws_id')
      .eq('id', projectId)
      .eq('ws_id', wsId)
      .single();

    if (projectError || !projectRecord) {
      return NextResponse.json(
        { error: 'Project not found or does not belong to workspace' },
        { status: 404 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size exceeds 10MB limit' },
        { status: 400 }
      );
    }

    // Generate unique file path with UUID
    const uuid = randomUUID();
    const lastDotIndex = file.name.lastIndexOf('.');
    const fileExt =
      lastDotIndex !== -1
        ? file.name.substring(lastDotIndex + 1).toLowerCase()
        : null;
    const fileName = fileExt ? `${uuid}.${fileExt}` : uuid;
    const filePath = `${wsId}/project-updates/${updateId}/${fileName}`;

    // Upload file to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('workspaces')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      );
    }

    // Create attachment record
    const { data: attachment, error: createError } = await supabase
      .from('task_project_update_attachments')
      .insert({
        update_id: updateId,
        file_name: file.name,
        file_path: uploadData.path,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: user.id,
      })
      .select(
        `
        *,
        uploader:users!task_project_update_attachments_uploaded_by_fkey(
          id,
          display_name,
          avatar_url
        )
      `
      )
      .single();

    if (createError) {
      // Clean up uploaded file if database insert fails
      await supabase.storage.from('workspaces').remove([uploadData.path]);
      console.error('Error creating attachment record:', createError);
      return NextResponse.json(
        { error: 'Failed to create attachment' },
        { status: 500 }
      );
    }

    // Generate signed URL for the file
    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from('workspaces')
        .createSignedUrl(uploadData.path, 31536000); // 1 year expiry

    if (signedUrlError) {
      console.error('Error generating signed URL:', signedUrlError);
    }

    return NextResponse.json(
      {
        ...attachment,
        signedUrl: signedUrlData?.signedUrl,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      'Error in POST /api/v1/workspaces/[wsId]/task-projects/[projectId]/updates/[updateId]/attachments:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ wsId: string; projectId: string; updateId: string }>;
  }
) {
  try {
    const { wsId, projectId, updateId } = await params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get attachment ID from query params
    const { searchParams } = new URL(request.url);
    const attachmentId = searchParams.get('attachmentId');

    if (!attachmentId) {
      return NextResponse.json(
        { error: 'Attachment ID is required' },
        { status: 400 }
      );
    }

    // Validate attachmentId format (UUID)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(attachmentId)) {
      return NextResponse.json(
        { error: 'Invalid attachment ID format' },
        { status: 400 }
      );
    }

    // Load attachment and verify it exists
    const { data: existingAttachment, error: attachmentError } = await supabase
      .from('task_project_update_attachments')
      .select('id, file_path, uploaded_by, update_id')
      .eq('id', attachmentId)
      .single();

    if (attachmentError || !existingAttachment) {
      return NextResponse.json(
        { error: 'Attachment not found' },
        { status: 404 }
      );
    }

    // Verify attachment belongs to the specified update
    if (existingAttachment.update_id !== updateId) {
      return NextResponse.json(
        { error: 'Attachment does not belong to the specified update' },
        { status: 403 }
      );
    }

    // Load update and verify it exists
    const { data: updateRecord, error: updateError } = await supabase
      .from('task_project_updates')
      .select('id, project_id')
      .eq('id', updateId)
      .single();

    if (updateError || !updateRecord) {
      return NextResponse.json({ error: 'Update not found' }, { status: 404 });
    }

    // Verify update belongs to the specified project
    if (updateRecord.project_id !== projectId) {
      return NextResponse.json(
        { error: 'Update does not belong to the specified project' },
        { status: 403 }
      );
    }

    // Load project and verify it exists
    const { data: projectRecord, error: projectError } = await supabase
      .from('task_projects')
      .select('id, ws_id')
      .eq('id', projectId)
      .single();

    if (projectError || !projectRecord) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Verify project belongs to the specified workspace
    if (projectRecord.ws_id !== wsId) {
      return NextResponse.json(
        { error: 'Project does not belong to the specified workspace' },
        { status: 403 }
      );
    }

    // Only uploader can delete
    if (existingAttachment.uploaded_by !== user.id) {
      return NextResponse.json(
        { error: 'Only the uploader can delete this attachment' },
        { status: 403 }
      );
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('workspaces')
      .remove([existingAttachment.file_path]);

    if (storageError) {
      console.error('Error deleting file from storage:', storageError);
      // Continue with database deletion even if storage deletion fails
    }

    // Delete attachment record
    const { error: deleteError } = await supabase
      .from('task_project_update_attachments')
      .delete()
      .eq('id', attachmentId);

    if (deleteError) {
      console.error('Error deleting attachment record:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete attachment' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      'Error in DELETE /api/v1/workspaces/[wsId]/task-projects/[projectId]/updates/[updateId]/attachments:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
