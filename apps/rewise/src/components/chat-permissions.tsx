import { createClient } from '@/utils/supabase/client';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/ui/components/ui/avatar';
import { Button } from '@repo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/ui/dialog';
import { Input } from '@repo/ui/components/ui/input';
import { Label } from '@repo/ui/components/ui/label';
import { Switch } from '@repo/ui/components/ui/switch';
import { toast } from '@repo/ui/hooks/use-toast';
import { Copy, Link, QrCode, User, UserPlus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { QRCode } from 'react-qrcode-logo';

interface ChatMember {
  email: string;
  display_name?: string;
  avatar_url?: string;
}

interface ChatPermissionsProps {
  chatId: string;
  isPublic: boolean;
  creatorId: string;
  currentUserId?: string;
  onUpdateVisibility: (isPublic: boolean) => void;
}

export function ChatPermissions({
  chatId,
  isPublic,
  creatorId,
  currentUserId,
  onUpdateVisibility,
}: ChatPermissionsProps) {
  const t = useTranslations('ai_chat');
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const isOwner = currentUserId === creatorId;
  const chatUrl = `${window.location.origin}/c/${chatId}`;

  // Fetch members
  useEffect(() => {
    const fetchMembers = async () => {
      setLoading(true);
      const supabase = createClient();

      // Get all members
      const { data: memberships, error: membershipError } = await supabase
        .from('ai_chat_members')
        .select('email')
        .eq('chat_id', chatId);

      if (membershipError) {
        console.error('Error fetching members:', membershipError);
        setLoading(false);
        return;
      }

      if (!memberships || memberships.length === 0) {
        setMembers([]);
        setLoading(false);
        return;
      }

      setMembers(memberships);
      setLoading(false);
    };

    fetchMembers();
  }, [chatId]);

  const addMember = async () => {
    if (!email) return;

    setAddingMember(true);
    const supabase = createClient();

    // Check if already a member
    if (members.some((m) => m.email === email)) {
      toast({
        title: t('already_member'),
        description: t('user_already_has_access'),
        variant: 'destructive',
      });
      setAddingMember(false);
      return;
    }

    // Add member
    const { error: membershipError } = await supabase
      .from('ai_chat_members')
      .insert({ chat_id: chatId, email: email });

    if (membershipError) {
      toast({
        title: t('error_adding_member'),
        description: membershipError.message,
        variant: 'destructive',
      });
    } else {
      const newMember: ChatMember = {
        email,
      };

      setMembers([...members, newMember]);
      setEmail('');
      toast({
        title: t('member_added'),
        description: t('user_now_has_access'),
      });
    }

    setAddingMember(false);
  };

  const removeMember = async (memberEmail: string) => {
    const supabase = createClient();

    const { error } = await supabase
      .from('ai_chat_members')
      .delete()
      .eq('chat_id', chatId)
      .eq('email', memberEmail);

    if (error) {
      toast({
        title: t('error_removing_member'),
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setMembers(members.filter((m) => m.email !== memberEmail));
      toast({
        title: t('member_removed'),
        description: t('user_access_revoked'),
      });
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(chatUrl);
    toast({
      title: t('chat_visibility.link_copied'),
      description: chatUrl,
    });
  };

  if (!isOwner) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="public" className="font-medium">
          {t('public_chat')}
        </Label>
        <Switch
          id="public"
          checked={isPublic}
          onCheckedChange={onUpdateVisibility}
        />
      </div>

      {isPublic && (
        <div className="flex items-center gap-2">
          <Button variant="outline" className="flex-1" onClick={copyLink}>
            <Copy className="mr-2 h-4 w-4" />
            {t('copy_public_link')}
          </Button>
          <Button variant="outline" size="icon" onClick={() => setShowQR(true)}>
            <QrCode className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email" className="font-medium">
          {t('add_member')}
        </Label>
        <div className="flex gap-2">
          <Input
            id="email"
            type="email"
            placeholder={t('enter_email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button
            size="icon"
            onClick={addMember}
            disabled={!email || addingMember}
          >
            <UserPlus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="font-medium">{t('members')}</Label>
        {loading ? (
          <div className="text-muted-foreground text-sm">{t('loading')}</div>
        ) : members.length === 0 ? (
          <div className="text-muted-foreground text-sm">{t('no_members')}</div>
        ) : (
          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.email}
                className="flex items-center justify-between rounded-lg border p-2"
              >
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={member.avatar_url || undefined} />
                    <AvatarFallback>
                      {member.display_name?.[0]?.toUpperCase() || (
                        <User className="h-4 w-4" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="space-y-1">
                    <div className="font-medium">
                      {member.display_name || t('unnamed_user')}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {member.email}
                    </div>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeMember(member.email)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('chat_visibility.qr_code')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <QRCode value={chatUrl} size={256} />
            <Button variant="outline" onClick={copyLink}>
              <Link className="mr-2 h-4 w-4" />
              {chatUrl}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
