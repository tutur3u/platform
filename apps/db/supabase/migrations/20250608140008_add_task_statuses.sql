-- Create task board statuses enum
CREATE TYPE task_board_status AS ENUM ('not_started', 'active', 'done', 'closed');

-- Create status template table
CREATE TABLE task_board_status_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    statuses JSONB NOT NULL, -- Array of status objects with their properties
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add status and color to task_lists table
ALTER TABLE task_lists 
ADD COLUMN status task_board_status DEFAULT 'not_started',
ADD COLUMN color TEXT DEFAULT 'GRAY',
ADD COLUMN position INTEGER DEFAULT 0;

-- Add template_id to workspace_boards table
ALTER TABLE workspace_boards 
ADD COLUMN template_id UUID REFERENCES task_board_status_templates(id);

-- Create index for better performance
CREATE INDEX idx_task_lists_status ON task_lists(status);
CREATE INDEX idx_task_lists_board_status ON task_lists(board_id, status);

-- Insert default status templates
INSERT INTO task_board_status_templates (name, description, statuses, is_default) VALUES 
(
    'Basic Kanban',
    'Simple 4-column Kanban board for general project management',
    '[
        {"status": "not_started", "name": "To Do", "color": "GRAY", "allow_multiple": true},
        {"status": "active", "name": "In Progress", "color": "BLUE", "allow_multiple": true},
        {"status": "done", "name": "Done", "color": "GREEN", "allow_multiple": true},
        {"status": "closed", "name": "Closed", "color": "PURPLE", "allow_multiple": false}
    ]'::jsonb,
    true
),
(
    'Software Development',
    'Development workflow with backlog, sprint, review phases',
    '[
        {"status": "not_started", "name": "Backlog", "color": "GRAY", "allow_multiple": true},
        {"status": "not_started", "name": "Sprint Ready", "color": "YELLOW", "allow_multiple": true},
        {"status": "active", "name": "In Development", "color": "BLUE", "allow_multiple": true},
        {"status": "active", "name": "Code Review", "color": "ORANGE", "allow_multiple": true},
        {"status": "active", "name": "Testing", "color": "CYAN", "allow_multiple": true},
        {"status": "done", "name": "Done", "color": "GREEN", "allow_multiple": true},
        {"status": "closed", "name": "Archived", "color": "PURPLE", "allow_multiple": false}
    ]'::jsonb,
    false
),
(
    'Content Creation',
    'Editorial workflow for content production',
    '[
        {"status": "not_started", "name": "Ideas", "color": "GRAY", "allow_multiple": true},
        {"status": "not_started", "name": "Research", "color": "YELLOW", "allow_multiple": true},
        {"status": "active", "name": "Writing", "color": "BLUE", "allow_multiple": true},
        {"status": "active", "name": "Review", "color": "ORANGE", "allow_multiple": true},
        {"status": "active", "name": "Editing", "color": "CYAN", "allow_multiple": true},
        {"status": "done", "name": "Published", "color": "GREEN", "allow_multiple": true},
        {"status": "closed", "name": "Archived", "color": "PURPLE", "allow_multiple": false}
    ]'::jsonb,
    false
),
(
    'Sales Pipeline',
    'Sales process from lead to close',
    '[
        {"status": "not_started", "name": "Leads", "color": "GRAY", "allow_multiple": true},
        {"status": "not_started", "name": "Qualified", "color": "YELLOW", "allow_multiple": true},
        {"status": "active", "name": "Proposal", "color": "BLUE", "allow_multiple": true},
        {"status": "active", "name": "Negotiation", "color": "ORANGE", "allow_multiple": true},
        {"status": "done", "name": "Won", "color": "GREEN", "allow_multiple": true},
        {"status": "closed", "name": "Lost", "color": "RED", "allow_multiple": false}
    ]'::jsonb,
    false
);

-- Function to ensure only one closed list per board
CREATE OR REPLACE FUNCTION ensure_single_closed_list()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if we're inserting/updating to closed status
    IF NEW.status = 'closed' THEN
        -- Check if there's already a closed list for this board (excluding current record for updates)
        IF EXISTS (
            SELECT 1 FROM task_lists 
            WHERE board_id = NEW.board_id 
            AND status = 'closed' 
            AND deleted = false
            AND (TG_OP = 'INSERT' OR id != NEW.id)
        ) THEN
            RAISE EXCEPTION 'Only one closed list is allowed per board';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce single closed list rule
CREATE TRIGGER enforce_single_closed_list
    BEFORE INSERT OR UPDATE ON task_lists
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_closed_list();

-- Function to automatically create closed list when board is created from template
CREATE OR REPLACE FUNCTION create_default_lists_from_template()
RETURNS TRIGGER AS $$
DECLARE
    template_record RECORD;
    status_item JSONB;
    position_counter INTEGER := 0;
BEGIN
    -- Only proceed if template_id is set
    IF NEW.template_id IS NOT NULL THEN
        -- Get the template
        SELECT * INTO template_record 
        FROM task_board_status_templates 
        WHERE id = NEW.template_id;
        
        -- Create lists for each status in the template
        FOR status_item IN SELECT * FROM jsonb_array_elements(template_record.statuses)
        LOOP
            INSERT INTO task_lists (
                board_id,
                name,
                status,
                color,
                position
            ) VALUES (
                NEW.id,
                status_item->>'name',
                (status_item->>'status')::task_board_status,
                status_item->>'color',
                position_counter
            );
            position_counter := position_counter + 1;
        END LOOP;
    ELSE
        -- Create default lists if no template
        INSERT INTO task_lists (board_id, name, status, color, position) VALUES 
        (NEW.id, 'To Do', 'not_started', 'GRAY', 0),
        (NEW.id, 'In Progress', 'active', 'BLUE', 1),
        (NEW.id, 'Done', 'done', 'GREEN', 2),
        (NEW.id, 'Closed', 'closed', 'PURPLE', 3);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-create lists when board is created
CREATE TRIGGER create_default_lists_on_board_creation
    AFTER INSERT ON workspace_boards
    FOR EACH ROW
    EXECUTE FUNCTION create_default_lists_from_template();

-- Create policies for new tables
ALTER TABLE task_board_status_templates ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read status templates (they're like public templates)
CREATE POLICY "Status templates are readable by everyone" ON task_board_status_templates
    FOR SELECT TO authenticated USING (true);

-- Only allow admins to manage templates (for now, we'll allow authenticated users)
CREATE POLICY "Status templates are manageable by authenticated users" ON task_board_status_templates
    FOR ALL TO authenticated USING (true);

-- Set default statuses for existing task lists based on common naming patterns
UPDATE task_lists 
SET status = CASE 
    WHEN LOWER(name) ILIKE '%done%' OR LOWER(name) ILIKE '%complete%' OR LOWER(name) ILIKE '%finish%' THEN 'done'::task_board_status
    WHEN LOWER(name) ILIKE '%progress%' OR LOWER(name) ILIKE '%doing%' OR LOWER(name) ILIKE '%active%' OR LOWER(name) ILIKE '%working%' THEN 'active'::task_board_status
    WHEN LOWER(name) ILIKE '%closed%' OR LOWER(name) ILIKE '%archive%' OR LOWER(name) ILIKE '%trash%' THEN 'closed'::task_board_status
    ELSE 'not_started'::task_board_status
END,
color = CASE 
    WHEN LOWER(name) ILIKE '%done%' OR LOWER(name) ILIKE '%complete%' OR LOWER(name) ILIKE '%finish%' THEN 'GREEN'
    WHEN LOWER(name) ILIKE '%progress%' OR LOWER(name) ILIKE '%doing%' OR LOWER(name) ILIKE '%active%' OR LOWER(name) ILIKE '%working%' THEN 'BLUE'
    WHEN LOWER(name) ILIKE '%closed%' OR LOWER(name) ILIKE '%archive%' OR LOWER(name) ILIKE '%trash%' THEN 'PURPLE'
    ELSE 'GRAY'
END
WHERE status IS NULL OR color IS NULL;

-- Automatically mark tasks as completed if they are in done or closed lists
UPDATE tasks 
SET archived = true 
WHERE list_id IN (
    SELECT id FROM task_lists 
    WHERE status IN ('done', 'closed') 
    AND deleted = false
) AND archived = false;
