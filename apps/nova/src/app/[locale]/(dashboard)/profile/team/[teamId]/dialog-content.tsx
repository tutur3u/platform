import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { ScrollText, Target } from '@tuturuuu/ui/icons';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useParams } from 'next/navigation';
import { useState } from 'react';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'goals' | 'reports' | 'des';
  initialData?: {
    description?: string;
    goals?: string;
  };
  isEditing?: boolean;
}

export function TeamActionDialog({
  isOpen,
  onClose,
  type,
  initialData,
  isEditing,
}: DialogProps) {
  const params = useParams();
  const teamId = params.teamId as string;
  const { toast } = useToast();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    description: initialData?.description || '',
    goals: initialData?.goals || '',
  });

  const handleSave = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('nova_teams')
        .update({
          description: formData.description,
          goals: formData.goals,
        })
        .eq('id', teamId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Team information updated successfully',
      });
      onClose();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update team information',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const content = {
    goals: {
      title: 'Team Goals',
      icon: <Target className="text-primary h-5 w-5" />,
      description: 'Set and track your team objectives',
      content: (
        <div className="space-y-4 py-4">
          <div className="rounded-lg border p-4">
            <h3 className="font-medium">Current Goals</h3>
            <p className="text-muted-foreground text-sm">
              No active goals set for this team.
            </p>
          </div>
        </div>
      ),
    },
    reports: {
      title: 'Team Reports',
      icon: <ScrollText className="text-primary h-5 w-5" />,
      description: 'View team performance reports',
      content: (
        <div className="space-y-4 py-4">
          <div className="rounded-lg border p-4">
            <h3 className="font-medium">Available Reports</h3>
            <p className="text-muted-foreground text-sm">
              No reports generated yet.
            </p>
          </div>
        </div>
      ),
    },
    des: {
      title: isEditing ? 'Edit Team Information' : 'Team Description',
      icon: <ScrollText className="text-primary h-5 w-5" />,
      description: isEditing
        ? 'Update your team description and goals'
        : 'View team description',
      content: isEditing ? (
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <h3 className="font-medium">Description</h3>
            <Textarea
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="Enter team description..."
              className="min-h-[100px]"
            />
          </div>
          <div className="space-y-2">
            <h3 className="font-medium">Goals</h3>
            <Textarea
              value={formData.goals}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, goals: e.target.value }))
              }
              placeholder="Enter team goals..."
              className="min-h-[100px]"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4 py-4">
          <div className="rounded-lg border p-4">
            <h3 className="font-medium">Description</h3>
            <p className="text-muted-foreground text-sm">
              {initialData?.description || 'No description available.'}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <h3 className="font-medium">Goals</h3>
            <p className="text-muted-foreground text-sm">
              {initialData?.goals || 'No goals set.'}
            </p>
          </div>
        </div>
      ),
    },
  };

  const selectedContent = content[type];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedContent.icon}
            {selectedContent.title}
          </DialogTitle>
          <DialogDescription>{selectedContent.description}</DialogDescription>
        </DialogHeader>
        {selectedContent.content}
        <DialogFooter>
          {isEditing ? (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
