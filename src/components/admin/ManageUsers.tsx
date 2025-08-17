import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import axios from 'axios';
import { 
  Users, 
  Search, 
  UserX, 
  UserCog, 
  Shield, 
  ShieldOff,
  UserMinus,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  lastLogin: string | null;
}

const ManageUsers: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [userToModify, setUserToModify] = useState<User | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [actionType, setActionType] = useState<'delete' | 'suspend' | 'promote' | 'demote'>('delete');

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [searchTerm, users]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/admin/users');
      setUsers(response.data);
      setFilteredUsers(response.data);
    } catch (error) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const filterUsers = () => {
    if (!searchTerm.trim()) {
      setFilteredUsers(users);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = users.filter(
      user => 
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term) ||
        user.role.toLowerCase().includes(term)
    );
    
    setFilteredUsers(filtered);
  };

  const openConfirmDialog = (user: User, action: 'delete' | 'suspend' | 'promote' | 'demote') => {
    setUserToModify(user);
    setActionType(action);
    setShowConfirmDialog(true);
  };

  const closeConfirmDialog = () => {
    setShowConfirmDialog(false);
    setUserToModify(null);
  };

  const handleUserAction = async () => {
    if (!userToModify) return;

    try {
      let endpoint = '';
      let successMessage = '';

      switch (actionType) {
        case 'delete':
          endpoint = `/api/admin/users/${userToModify.id}`;
          successMessage = `User ${userToModify.name} has been deleted`;
          await axios.delete(endpoint);
          setUsers(users.filter(user => user.id !== userToModify.id));
          break;
        case 'suspend':
          endpoint = `/api/admin/users/${userToModify.id}/status`;
          const newStatus = userToModify.status === 'approved' ? 'suspended' : 'approved';
          successMessage = `User ${userToModify.name} has been ${newStatus}`;
          await axios.patch(endpoint, { status: newStatus });
          setUsers(users.map(user => 
            user.id === userToModify.id ? { ...user, status: newStatus } : user
          ));
          break;
        case 'promote':
          endpoint = `/api/admin/users/${userToModify.id}/role`;
          successMessage = `User ${userToModify.name} has been promoted to admin`;
          await axios.patch(endpoint, { role: 'admin' });
          setUsers(users.map(user => 
            user.id === userToModify.id ? { ...user, role: 'admin' } : user
          ));
          break;
        case 'demote':
          endpoint = `/api/admin/users/${userToModify.id}/role`;
          successMessage = `User ${userToModify.name} has been demoted to user`;
          await axios.patch(endpoint, { role: 'user' });
          setUsers(users.map(user => 
            user.id === userToModify.id ? { ...user, role: 'user' } : user
          ));
          break;
      }

      toast.success(successMessage);
    } catch (error) {
      toast.error('Failed to perform action');
    } finally {
      closeConfirmDialog();
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 flex items-center">
          <Users className="h-6 w-6 mr-2 text-primary-600" />
          Manage Users
        </h1>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 border-b border-gray-200 sm:px-6">
          <div className="flex flex-wrap items-center justify-between">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              System Users
            </h3>
            <div className="mt-2 sm:mt-0 relative rounded-md shadow-sm w-full sm:w-64">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="focus:ring-primary-500 focus:border-primary-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
                placeholder="Search users..."
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-center py-10">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-700">Loading users...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-10">
              <UserX className="h-12 w-12 text-gray-400 mx-auto" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No users found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm ? 'Try adjusting your search term' : 'No users available in the system'}
              </p>
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="mt-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Joined
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Login
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {user.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.status === 'approved' ? 'bg-green-100 text-green-800' : 
                        user.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                        'bg-red-100 text-red-800'
                      }`}>
                        {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(user.lastLogin)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        {user.role !== 'admin' ? (
                          <button 
                            onClick={() => openConfirmDialog(user, 'promote')}
                            className="text-indigo-600 hover:text-indigo-900"
                            title="Promote to Admin"
                          >
                            <Shield className="h-5 w-5" />
                          </button>
                        ) : (
                          <button 
                            onClick={() => openConfirmDialog(user, 'demote')}
                            className="text-gray-600 hover:text-gray-900"
                            title="Demote to User"
                          >
                            <ShieldOff className="h-5 w-5" />
                          </button>
                        )}
                        
                        <button 
                          onClick={() => openConfirmDialog(user, 'suspend')}
                          className={`${
                            user.status === 'approved' ? 'text-yellow-600 hover:text-yellow-900' : 'text-green-600 hover:text-green-900'
                          }`}
                          title={user.status === 'approved' ? 'Suspend User' : 'Activate User'}
                        >
                          {user.status === 'approved' ? 
                            <UserMinus className="h-5 w-5" /> : 
                            <UserCog className="h-5 w-5" />
                          }
                        </button>
                        
                        <button 
                          onClick={() => openConfirmDialog(user, 'delete')}
                          className="text-red-600 hover:text-red-900"
                          title="Delete User"
                        >
                          <UserX className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && userToModify && (
        <div className="fixed z-10 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true"></div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
              <div className="sm:flex sm:items-start">
                <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                  {actionType === 'delete' && <AlertCircle className="h-6 w-6 text-red-600" aria-hidden="true" />}
                  {actionType === 'suspend' && (
                    userToModify.status === 'approved' ? 
                      <XCircle className="h-6 w-6 text-yellow-600" aria-hidden="true" /> :
                      <CheckCircle className="h-6 w-6 text-green-600" aria-hidden="true" />
                  )}
                  {actionType === 'promote' && <Shield className="h-6 w-6 text-indigo-600" aria-hidden="true" />}
                  {actionType === 'demote' && <ShieldOff className="h-6 w-6 text-gray-600" aria-hidden="true" />}
                </div>
                <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                  <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                    {actionType === 'delete' && 'Delete User'}
                    {actionType === 'suspend' && (userToModify.status === 'approved' ? 'Suspend User' : 'Activate User')}
                    {actionType === 'promote' && 'Promote to Admin'}
                    {actionType === 'demote' && 'Demote to User'}
                  </h3>
                  <div className="mt-2">
                    <p className="text-sm text-gray-500">
                      {actionType === 'delete' && `Are you sure you want to delete ${userToModify.name}? This action cannot be undone.`}
                      {actionType === 'suspend' && (
                        userToModify.status === 'approved' ? 
                          `Are you sure you want to suspend ${userToModify.name}? They will no longer have access to the system.` :
                          `Are you sure you want to activate ${userToModify.name}? They will have access to the system.`
                      )}
                      {actionType === 'promote' && `Are you sure you want to promote ${userToModify.name} to admin? They will have full system access.`}
                      {actionType === 'demote' && `Are you sure you want to demote ${userToModify.name} to regular user? They will lose admin privileges.`}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white sm:ml-3 sm:w-auto sm:text-sm ${
                    actionType === 'delete' ? 'bg-red-600 hover:bg-red-700' : 
                    actionType === 'suspend' ? (userToModify.status === 'approved' ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700') :
                    actionType === 'promote' ? 'bg-indigo-600 hover:bg-indigo-700' :
                    'bg-gray-600 hover:bg-gray-700'
                  }`}
                  onClick={handleUserAction}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 sm:mt-0 sm:w-auto sm:text-sm"
                  onClick={closeConfirmDialog}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageUsers;