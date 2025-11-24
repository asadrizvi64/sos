import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { queryKeys } from '../lib/queryKeys';

interface Team {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

interface TeamMember {
  id: string;
  userId: string;
  roleId?: string;
  joinedAt: string;
  user: {
    id: string;
    email: string;
    name?: string;
    avatar?: string;
  };
}

interface TeamDetail extends Team {
  members: TeamMember[];
}

interface Invitation {
  id: string;
  organizationId: string;
  workspaceId?: string;
  teamId?: string;
  email: string;
  roleId?: string;
  token: string;
  expiresAt: string;
  acceptedAt?: string;
  createdAt: string;
  inviter: {
    id: string;
    email: string;
    name?: string;
  };
}

export default function Teams() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<TeamDetail | null>(null);
  const [showTeamDetail, setShowTeamDetail] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });
  const [inviteData, setInviteData] = useState({
    email: '',
    teamId: '',
    roleId: '',
    expiresInDays: 7,
  });

  const { data: teams = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.teams.all,
    queryFn: async () => {
      const response = await api.get('/teams');
      return response.data;
    },
  });

  const { data: invitations = [] } = useQuery({
    queryKey: queryKeys.invitations.all,
    queryFn: async () => {
      const response = await api.get('/invitations');
      return response.data;
    },
  });

  const { data: teamDetail, refetch: refetchTeamDetail } = useQuery({
    queryKey: selectedTeam ? queryKeys.teams.detail(selectedTeam.id) : [''],
    queryFn: async () => {
      if (!selectedTeam) return null;
      const response = await api.get(`/teams/${selectedTeam.id}`);
      return response.data as TeamDetail;
    },
    enabled: false, // Only fetch when explicitly called
  });

  const loadTeamDetail = async (teamId: string) => {
    setSelectedTeam({ id: teamId } as TeamDetail);
    setShowTeamDetail(true);
    // Trigger the query
    queryClient.fetchQuery({
      queryKey: queryKeys.teams.detail(teamId),
      queryFn: async () => {
        const response = await api.get(`/teams/${teamId}`);
        return response.data as TeamDetail;
      },
    }).then((data) => {
      setSelectedTeam(data);
    }).catch((error) => {
      console.error('Error loading team details:', error);
    });
  };

  const addMemberMutation = useMutation({
    mutationFn: async ({ teamId, userId }: { teamId: string; userId: string }) => {
      await api.post(`/teams/${teamId}/members`, { userId });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.detail(variables.teamId) });
      if (selectedTeam) {
        loadTeamDetail(variables.teamId);
      }
      alert('Member added successfully!');
    },
    onError: (error: any) => {
      alert(error.response?.data?.error || 'Failed to add member');
    },
  });

  const handleCreate = () => {
    setFormData({ name: '', description: '' });
    setShowCreateModal(true);
  };

  const handleEdit = (team: Team) => {
    setFormData({
      name: team.name,
      description: team.description || '',
    });
    setSelectedTeam(team as any);
    setShowCreateModal(true);
  };

  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      await api.delete(`/teams/${teamId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.all });
    },
    onError: (error: any) => {
      alert(error.response?.data?.error || 'Error deleting team');
    },
  });

  const saveTeamMutation = useMutation({
    mutationFn: async (data: { id?: string; formData: typeof formData }) => {
      if (data.id) {
        await api.put(`/teams/${data.id}`, data.formData);
      } else {
        await api.post('/teams', data.formData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.all });
      setShowCreateModal(false);
      setSelectedTeam(null);
    },
    onError: (error: any) => {
      alert(error.response?.data?.error || 'Error saving team');
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: typeof inviteData) => {
      await api.post('/invitations', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations.all });
      setShowInviteModal(false);
      alert('Invitation sent successfully!');
    },
    onError: (error: any) => {
      alert(error.response?.data?.error || 'Error sending invitation');
    },
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      await api.delete(`/invitations/${invitationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations.all });
    },
    onError: (error: any) => {
      alert(error.response?.data?.error || 'Error canceling invitation');
    },
  });

  const handleDelete = (teamId: string) => {
    if (!confirm('Are you sure you want to delete this team?')) return;
    deleteTeamMutation.mutate(teamId);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveTeamMutation.mutate({
      id: selectedTeam && !selectedTeam.memberCount ? selectedTeam.id : undefined,
      formData,
    });
  };

  const handleInvite = (teamId?: string) => {
    setInviteData({
      email: '',
      teamId: teamId || '',
      roleId: '',
      expiresInDays: 7,
    });
    setShowInviteModal(true);
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    inviteMutation.mutate(inviteData);
  };

  const handleCancelInvitation = (invitationId: string) => {
    if (!confirm('Are you sure you want to cancel this invitation?')) return;
    cancelInvitationMutation.mutate(invitationId);
  };

  const resendInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      await api.post(`/invitations/${invitationId}/resend`);
    },
    onSuccess: () => {
      alert('Invitation email resent successfully!');
    },
    onError: (error: any) => {
      alert(error.response?.data?.error || 'Error resending invitation');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({ teamId, userId }: { teamId: string; userId: string }) => {
      await api.delete(`/teams/${teamId}/members/${userId}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.detail(variables.teamId) });
      if (selectedTeam && selectedTeam.id === variables.teamId) {
        loadTeamDetail(variables.teamId);
      }
    },
    onError: (error: any) => {
      alert(error.response?.data?.error || 'Error removing member');
    },
  });

  const handleResendInvitation = (invitationId: string) => {
    resendInvitationMutation.mutate(invitationId);
  };

  const handleRemoveMember = (teamId: string, userId: string) => {
    if (!confirm('Are you sure you want to remove this member from the team?')) return;
    removeMemberMutation.mutate({ teamId, userId });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm p-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="ml-3 text-gray-600 dark:text-gray-400">Loading teams...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 animate-fade-in">
      {/* Header */}
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-gray-100 dark:via-gray-200 dark:to-gray-100 bg-clip-text text-transparent">
            Teams & Invitations
          </h1>
          <p className="text-gray-600 dark:text-gray-400">Manage teams and send invitations</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => handleInvite()}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-lg hover:from-emerald-700 hover:to-emerald-800 transition-all duration-200 font-medium shadow-md hover:shadow-lg"
          >
            Send Invitation
          </button>
          <button
            onClick={handleCreate}
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 font-medium shadow-md hover:shadow-lg"
          >
            + Create Team
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Teams List */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200/50 dark:border-gray-700/50">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Teams</h2>
          </div>
          <div className="divide-y divide-gray-200/50 dark:divide-gray-700/50">
            {teams.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <p className="text-gray-600 dark:text-gray-400 mb-2">No teams found</p>
                <p className="text-sm text-gray-500 dark:text-gray-500">Create your first team to get started</p>
              </div>
            ) : (
              teams.map((team, index) => (
                <div 
                  key={team.id} 
                  className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-200 animate-slide-up"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-100 dark:from-indigo-900/50 to-indigo-50 dark:to-indigo-900/30 flex items-center justify-center">
                          <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        </div>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">{team.name}</h3>
                      </div>
                      {team.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 ml-13">{team.description}</p>
                      )}
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 ml-13">
                        {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => loadTeamDetail(team.id)}
                        className="px-3 py-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-all duration-200 font-medium"
                      >
                        View
                      </button>
                      <button
                        onClick={() => handleEdit(team)}
                        className="px-3 py-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-all duration-200 font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(team.id)}
                        className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all duration-200 font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Invitations List */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200/50 dark:border-gray-700/50">
            <h2 className="text-lg font-semibold">Pending Invitations</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {invitations.filter((inv) => !inv.acceptedAt).length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No pending invitations.
              </div>
            ) : (
              invitations
                .filter((inv) => !inv.acceptedAt)
                .map((invitation) => (
                  <div key={invitation.id} className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{invitation.email}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Invited by {invitation.inviter.name || invitation.inviter.email}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Expires: {new Date(invitation.expiresAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleResendInvitation(invitation.id)}
                          className="text-blue-600 hover:text-blue-900 text-sm"
                        >
                          Resend
                        </button>
                        <button
                          onClick={() => handleCancelInvitation(invitation.id)}
                          className="text-red-600 hover:text-red-900 text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>

      {/* Team Detail Modal */}
      {showTeamDetail && selectedTeam && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">{selectedTeam.name}</h3>
                <button
                  onClick={() => setShowTeamDetail(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              {selectedTeam.description && (
                <p className="text-gray-600 mb-4">{selectedTeam.description}</p>
              )}

              <div className="flex justify-between items-center mb-4">
                <h4 className="font-medium">Members ({selectedTeam.members.length})</h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const userId = prompt('Enter user ID to add to team:');
                      if (!userId) return;
                      addMemberMutation.mutate({ teamId: selectedTeam.id, userId });
                    }}
                    className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                  >
                    Add Member
                  </button>
                  <button
                    onClick={() => handleInvite(selectedTeam.id)}
                    className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                  >
                    Invite Member
                  </button>
                </div>
              </div>

              <div className="border border-gray-200 rounded-md divide-y divide-gray-200">
                {selectedTeam.members.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    No members yet. Invite members to get started.
                  </div>
                ) : (
                  selectedTeam.members.map((member) => (
                    <div key={member.id} className="p-4 flex justify-between items-center">
                      <div>
                        <p className="font-medium text-gray-900">
                          {member.user.name || member.user.email}
                        </p>
                        <p className="text-sm text-gray-500">{member.user.email}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          Joined: {new Date(member.joinedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveMember(selectedTeam.id, member.userId)}
                        className="text-red-600 hover:text-red-900 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setShowTeamDetail(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Team Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {selectedTeam ? 'Edit Team' : 'Create Team'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setSelectedTeam(null);
                  setFormData({ name: '', description: '' });
                }}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Team Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  placeholder="e.g., Engineering Team"
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  rows={3}
                  placeholder="Describe the team's purpose..."
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setSelectedTeam(null);
                    setFormData({ name: '', description: '' });
                  }}
                  className="px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveTeamMutation.isPending || !formData.name.trim()}
                  className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-md hover:shadow-lg"
                >
                  {saveTeamMutation.isPending ? 'Creating...' : selectedTeam ? 'Update Team' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-lg shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Send Invitation</h3>

              <form onSubmit={handleInviteSubmit}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteData.email}
                    onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="user@example.com"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Team (Optional)
                  </label>
                  <select
                    value={inviteData.teamId}
                    onChange={(e) => setInviteData({ ...inviteData, teamId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">No team assignment</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expires In (Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={inviteData.expiresInDays}
                    onChange={(e) =>
                      setInviteData({ ...inviteData, expiresInDays: parseInt(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    Send Invitation
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

