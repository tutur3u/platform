-- Add an index to improve join performance
CREATE INDEX IF NOT EXISTS idx_whiteboards_ws_id ON whiteboards(ws_id);
CREATE INDEX IF NOT EXISTS idx_whiteboards_creator_id ON whiteboards(creator_id);

CREATE INDEX idx_whiteboards_snapshot_gin ON public.whiteboards USING GIN (snapshot);

CREATE POLICY "Workspace members can read and write whiteboards" ON public.whiteboards
    FOR ALL TO authenticated
    USING (
        ws_id IN (
            SELECT ws_id FROM public.workspace_members 
            WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        ws_id IN (
            SELECT ws_id FROM public.workspace_members 
            WHERE user_id = auth.uid()
        )
    );