'use client';

import { Avatar, AvatarFallback } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  Check,
  Copy,
  CreditCard,
  Edit,
  Home,
  Lock,
  MoreHorizontal,
  Share,
  Sparkles,
  Trash,
  UserCog,
  UserPlus,
  Users,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { motion } from 'framer-motion';
import { useState } from 'react';

type ColorType = 'blue' | 'green' | 'purple' | 'pink' | 'orange' | string;

export default function ManagePage() {
  const [activeTab, setActiveTab] = useState('members');

  const familyMembers = [
    {
      id: 1,
      name: 'Duc',
      role: 'Dad',
      initial: 'D',
      color: 'blue',
      status: 'Admin',
      email: 'duc@familyemail.com',
      permissions: ['admin', 'edit', 'invite'],
      dateJoined: '2 years ago',
    },
    {
      id: 2,
      name: 'Linh',
      role: 'Mom',
      initial: 'L',
      color: 'green',
      status: 'Admin',
      email: 'linh@familyemail.com',
      permissions: ['admin', 'edit', 'invite'],
      dateJoined: '2 years ago',
    },
    {
      id: 3,
      name: 'Minh',
      role: 'Son',
      initial: 'M',
      color: 'purple',
      status: 'Member',
      email: 'minh@familyemail.com',
      permissions: ['edit'],
      dateJoined: '1 year ago',
    },
    {
      id: 4,
      name: 'Suong',
      role: 'Daughter',
      initial: 'S',
      color: 'pink',
      status: 'Member',
      email: 'suong@familyemail.com',
      permissions: ['edit'],
      dateJoined: '1 year ago',
    },
  ];

  const pendingInvites = [
    {
      id: 1,
      email: 'grandma@familyemail.com',
      sentAt: '3 days ago',
      sentBy: 'Duc',
    },
    {
      id: 2,
      email: 'grandpa@familyemail.com',
      sentAt: '3 days ago',
      sentBy: 'Duc',
    },
  ];

  const subscriptionDetails = {
    plan: 'Family Pro',
    price: '$9.99',
    billingCycle: 'Monthly',
    nextBilling: 'August 15, 2023',
    features: [
      'Unlimited members',
      'Advanced calendar features',
      'Enhanced privacy controls',
      'Premium AI communication tools',
      'Priority support',
    ],
  };

  const getBackgroundColor = (color: ColorType): string => {
    switch (color) {
      case 'blue':
        return 'bg-blue-500/20 text-blue-600 dark:bg-blue-500/30 dark:text-blue-400';
      case 'green':
        return 'bg-green-500/20 text-green-600 dark:bg-green-500/30 dark:text-green-400';
      case 'purple':
        return 'bg-purple-500/20 text-purple-600 dark:bg-purple-500/30 dark:text-purple-400';
      case 'pink':
        return 'bg-pink-500/20 text-pink-600 dark:bg-pink-500/30 dark:text-pink-400';
      case 'orange':
        return 'bg-orange-500/20 text-orange-600 dark:bg-orange-500/30 dark:text-orange-400';
      default:
        return 'bg-gray-500/20 text-gray-600 dark:bg-gray-500/30 dark:text-gray-400';
    }
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-linear-to-r flex h-10 w-10 items-center justify-center rounded-full from-blue-500/80 to-purple-500/80">
            <UserCog className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Family Management</h1>
            <p className="text-muted-foreground text-sm">
              Manage members, invites, and subscription
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="bg-linear-to-r from-blue-600 to-purple-600 text-white"
        >
          <UserPlus className="mr-1 h-4 w-4" /> Invite Member
        </Button>
      </div>

      <Tabs
        defaultValue="members"
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full"
      >
        <TabsList className="mb-6 grid w-full grid-cols-3">
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="invites">Pending Invites</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 relative overflow-hidden backdrop-blur-sm">
            {/* Decorative elements */}
            <div className="absolute -left-20 -top-20 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl dark:bg-blue-500/20"></div>
            <div className="absolute -bottom-20 -right-20 h-40 w-40 rounded-full bg-purple-500/10 blur-3xl dark:bg-purple-500/20"></div>

            <CardHeader>
              <CardTitle>Family Members</CardTitle>
              <CardDescription>
                Manage family members and their permissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {familyMembers.map((member) => (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="border-foreground/10 dark:border-foreground/5 flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="flex items-center gap-4">
                      <Avatar
                        className={`h-10 w-10 ${getBackgroundColor(member.color)}`}
                      >
                        <AvatarFallback>{member.initial}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{member.name}</p>
                          <Badge variant="outline" className="text-xs">
                            {member.role}
                          </Badge>
                          {member.status === 'Admin' && (
                            <Badge className="bg-blue-500/20 text-blue-600 dark:bg-blue-500/30 dark:text-blue-400">
                              Admin
                            </Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground text-sm">
                          {member.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        Joined {member.dateJoined}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Edit className="mr-2 h-4 w-4" /> Edit Profile
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Lock className="mr-2 h-4 w-4" /> Manage Permissions
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600">
                            <Trash className="mr-2 h-4 w-4" /> Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 overflow-hidden backdrop-blur-sm">
              <CardHeader className="bg-linear-to-r from-blue-500/10 to-purple-500/10 pb-2 dark:from-blue-500/20 dark:to-purple-500/20">
                <CardTitle className="text-base">Family Settings</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-3">
                  <Button size="sm" variant="outline" className="w-full">
                    <Edit className="mr-2 h-4 w-4" /> Edit Family Profile
                  </Button>
                  <Button size="sm" variant="outline" className="w-full">
                    <Home className="mr-2 h-4 w-4" /> Family Home Address
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 overflow-hidden backdrop-blur-sm">
              <CardHeader className="bg-linear-to-r from-green-500/10 to-teal-500/10 pb-2 dark:from-green-500/20 dark:to-teal-500/20">
                <CardTitle className="text-base">Family Sharing</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <CardDescription className="text-foreground/80 mb-4">
                  Share your family code to invite others
                </CardDescription>
                <div className="flex items-center gap-2">
                  <Input
                    value="NGUYEN-FAMILY-123"
                    readOnly
                    className="border-foreground/10 bg-background/50"
                  />
                  <Button variant="outline" size="sm">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="invites">
          <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 relative overflow-hidden backdrop-blur-sm">
            <div className="absolute -left-20 -top-20 h-40 w-40 rounded-full bg-pink-500/10 blur-3xl dark:bg-pink-500/20"></div>
            <div className="absolute -bottom-20 -right-20 h-40 w-40 rounded-full bg-orange-500/10 blur-3xl dark:bg-orange-500/20"></div>

            <CardHeader>
              <CardTitle>Pending Invites</CardTitle>
              <CardDescription>
                Manage and send invites to join your family
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingInvites.length > 0 ? (
                <div className="space-y-4">
                  {pendingInvites.map((invite) => (
                    <motion.div
                      key={invite.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="border-foreground/10 dark:border-foreground/5 flex items-center justify-between rounded-lg border p-4"
                    >
                      <div>
                        <p className="font-medium">{invite.email}</p>
                        <div className="text-muted-foreground flex items-center gap-2 text-sm">
                          <span>
                            Sent {invite.sentAt} by {invite.sentBy}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm">
                          <Share className="mr-2 h-4 w-4" /> Resend
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                        >
                          <Trash className="mr-2 h-4 w-4" /> Cancel
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16">
                  <UserPlus className="text-muted-foreground mb-2 h-12 w-12 opacity-20" />
                  <p className="text-muted-foreground text-center">
                    No pending invites
                  </p>
                </div>
              )}
            </CardContent>
            <CardFooter className="bg-foreground/5 flex flex-col items-stretch gap-4 px-6 py-4">
              <h3 className="text-sm font-medium">Send New Invite</h3>
              <div className="flex gap-2">
                <Input
                  placeholder="Email address"
                  className="border-foreground/10 bg-background/50"
                />
                <Button className="bg-linear-to-r from-blue-600 to-purple-600 text-white">
                  Send Invite
                </Button>
              </div>
            </CardFooter>
          </Card>

          <div className="mt-6">
            <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 overflow-hidden backdrop-blur-sm">
              <CardHeader className="bg-linear-to-r from-purple-500/10 to-pink-500/10 pb-2 dark:from-purple-500/20 dark:to-pink-500/20">
                <CardTitle className="text-base">Invite Methods</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <CardDescription className="text-foreground/80 mb-4">
                  Choose how to invite family members to join
                </CardDescription>
                <div className="space-y-3">
                  <Button size="sm" variant="outline" className="w-full">
                    <Share className="mr-2 h-4 w-4" /> Share Link
                  </Button>
                  <Button size="sm" variant="outline" className="w-full">
                    <Users className="mr-2 h-4 w-4" /> Import Contacts
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="subscription">
          <div className="grid gap-6 md:grid-cols-[1fr_300px]">
            <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 relative overflow-hidden backdrop-blur-sm">
              <div className="absolute -left-20 -top-20 h-60 w-60 rounded-full bg-green-500/10 blur-3xl dark:bg-green-500/20"></div>
              <div className="absolute -bottom-20 -right-20 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl dark:bg-blue-500/20"></div>

              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Subscription Details</CardTitle>
                    <CardDescription>
                      Manage your family subscription plan
                    </CardDescription>
                  </div>
                  <Badge className="bg-linear-to-r from-green-500/20 to-emerald-500/20 text-green-600 dark:from-green-500/30 dark:to-emerald-500/30 dark:text-green-400">
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                    {subscriptionDetails.plan}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="border-foreground/10 dark:border-foreground/5 rounded-lg border p-4">
                  <h3 className="mb-2 font-medium">Plan Information</h3>
                  <div className="grid gap-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Price:</span>
                      <span className="font-medium">
                        {subscriptionDetails.price} / month
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Billing Cycle:
                      </span>
                      <span>{subscriptionDetails.billingCycle}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Next Billing Date:
                      </span>
                      <span>{subscriptionDetails.nextBilling}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 font-medium">Features Included</h3>
                  <ul className="space-y-2">
                    {subscriptionDetails.features.map((feature, index) => (
                      <motion.li
                        key={index}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: index * 0.1 }}
                        className="flex items-center gap-2"
                      >
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/20 text-green-600 dark:bg-green-500/30 dark:text-green-400">
                          <Check className="h-3 w-3" />
                        </div>
                        <span className="text-sm">{feature}</span>
                      </motion.li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button className="bg-linear-to-r from-blue-600 to-purple-600 text-white">
                    <CreditCard className="mr-2 h-4 w-4" /> Update Payment
                    Method
                  </Button>
                  <Button variant="outline">Change Plan</Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 overflow-hidden backdrop-blur-sm">
                <CardHeader className="bg-linear-to-r from-blue-500/10 to-purple-500/10 pb-2 dark:from-blue-500/20 dark:to-purple-500/20">
                  <CardTitle className="text-base">Billing History</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span>July 15, 2023</span>
                      <span className="font-medium">
                        {subscriptionDetails.price}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>June 15, 2023</span>
                      <span className="font-medium">
                        {subscriptionDetails.price}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>May 15, 2023</span>
                      <span className="font-medium">
                        {subscriptionDetails.price}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2 w-full text-xs"
                    >
                      View All Transactions
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 overflow-hidden backdrop-blur-sm">
                <CardHeader className="bg-linear-to-r from-pink-500/10 to-rose-500/10 pb-2 dark:from-pink-500/20 dark:to-rose-500/20">
                  <CardTitle className="text-base">Need Help?</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <CardDescription className="text-foreground/80 mb-4">
                    If you have any questions about your subscription
                  </CardDescription>
                  <Button size="sm" variant="outline" className="w-full">
                    Contact Support
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
