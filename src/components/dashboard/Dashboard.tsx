import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { toast } from 'react-toastify';
import { 
  Upload, 
  History, 
  FileBarChart2, 
  AlertTriangle, 
  CheckCircle2, 
  Activity, 
  TrendingUp, 
  Dna,
  RefreshCw
} from 'lucide-react';

interface DashboardStatistics {
  totalClassifications: number;
  recentClassifications: {
    id: string;
    patientId: string;
    classification: string;
    confidence: number;
    createdAt: string;
  }[];
  classificationsByType: {
    type: string;
    count: number;
    percentage: number;
  }[];
  averageConfidence: number;
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const fetchDashboardData = async () => {
    try {
      console.log('Starting dashboard data fetch...');
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      console.log('Token exists:', !!token);
      console.log('Current user:', currentUser);
      
      if (!token) {
        throw new Error('Authentication token not found');
      }

      // Add retry logic
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          console.log(`Attempt ${retryCount + 1} to fetch dashboard data...`);
          const response = await axios.get('/api/dashboard/statistics', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            timeout: 10000,
            validateStatus: (status) => status >= 200 && status < 300
          });
          
          console.log('API response received:', {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            data: response.data
          });
          
          if (!response.data) {
            throw new Error('No data received from server');
          }
          
          // Validate response data structure
          const requiredFields = ['totalClassifications', 'recentClassifications', 'classificationsByType', 'averageConfidence'];
          const missingFields = requiredFields.filter(field => !(field in response.data));
          
          if (missingFields.length > 0) {
            throw new Error(`Missing required fields in response: ${missingFields.join(', ')}`);
          }
          
          setStats(response.data);
          break; // Success, exit retry loop
          
        } catch (attemptError: any) {
          console.error(`Attempt ${retryCount + 1} failed:`, {
            error: attemptError.message,
            status: attemptError.response?.status,
            data: attemptError.response?.data
          });
          
          if (attemptError.response?.status === 401) {
            // Authentication error, no need to retry
            throw attemptError;
          }
          
          retryCount++;
          if (retryCount === maxRetries) {
            throw attemptError;
          }
          
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        }
      }
    } catch (error: any) {
      console.error('Dashboard fetch error:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers
        }
      });
      
      let errorMessage = 'Failed to load dashboard data';
      
      if (error.response?.status === 401) {
        console.log('Authentication error - redirecting to login');
        toast.error('Session expired. Please login again.');
        navigate('/login');
        return;
      } else if (error.response?.status === 403) {
        errorMessage = 'You do not have permission to access the dashboard';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Request timed out. Please try again.';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }
      
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      console.log('Dashboard data fetch completed');
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('Dashboard component mounted');
    if (currentUser) {
      console.log('Current user data:', {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        role: currentUser.role,
        status: currentUser.status
      });
      fetchDashboardData();
    } else {
      console.log('No current user found');
      setError('User data not available');
      setLoading(false);
    }
    
    return () => {
      console.log('Dashboard component unmounting');
    };
  }, [currentUser]); // Add currentUser as dependency

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'text-green-600';
    if (confidence >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-3 text-gray-700">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">Error loading dashboard</h3>
        <p className="mt-1 text-sm text-gray-500">{error}</p>
        <div className="mt-6">
          <button
            onClick={fetchDashboardData}
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <RefreshCw className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Welcome back, {currentUser?.name}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Here's an overview of the ALL classification system
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Classifications Card */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <FileBarChart2 className="h-6 w-6 text-primary-600" aria-hidden="true" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Total Classifications
                  </dt>
                  <dd>
                    <div className="text-lg font-medium text-gray-900">
                      {stats?.totalClassifications || 0}
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-5 py-3">
            <div className="text-sm">
              <Link to="/history" className="font-medium text-primary-600 hover:text-primary-500">
                View all
              </Link>
            </div>
          </div>
        </div>

        {/* Average Confidence Card */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircle2 className="h-6 w-6 text-green-600" aria-hidden="true" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Average Confidence
                  </dt>
                  <dd>
                    <div className="text-lg font-medium text-gray-900">
                      {stats?.averageConfidence.toFixed(1) || 0}%
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-5 py-3">
            <div className="text-sm">
              <span className="font-medium text-gray-500">
                Across all classifications
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <h3 className="text-sm font-medium text-gray-500">Quick Actions</h3>
            <ul className="mt-3 space-y-3">
              <li>
                <Link 
                  to="/upload" 
                  className="flex items-center text-sm text-primary-600 hover:text-primary-800"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload New Data
                </Link>
              </li>
              <li>
                <Link 
                  to="/history" 
                  className="flex items-center text-sm text-primary-600 hover:text-primary-800"
                >
                  <History className="mr-2 h-4 w-4" />
                  View Classification History
                </Link>
              </li>
            </ul>
          </div>
          <div className="bg-gray-50 px-5 py-3">
            <div className="text-sm">
              <span className="font-medium text-gray-500">
                Streamline your workflow
              </span>
            </div>
          </div>
        </div>

        
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Recent Classifications */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <h3 className="text-lg leading-6 font-medium text-gray-900 flex items-center">
              <Activity className="h-5 w-5 mr-2 text-primary-600" />
              Recent Classifications
            </h3>
          </div>
          <div className="px-4 py-5 sm:p-6">
            {stats?.recentClassifications && stats.recentClassifications.length > 0 ? (
              <div className="flow-root">
                <ul className="-my-5 divide-y divide-gray-200">
                  {stats.recentClassifications.map((item) => (
                    <li key={item.id} className="py-4">
                      <div className="flex items-center space-x-4">
                        <div className="flex-shrink-0">
                          <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                            <Dna className="h-5 w-5 text-primary-600" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            Patient ID: {item.patientId}
                          </p>
                          <p className="text-sm text-gray-500 truncate">
                            Classification: {item.classification}
                          </p>
                        </div>
                        <div>
                          <div className={`text-sm ${getConfidenceColor(item.confidence)}`}>
                            {item.confidence.toFixed(1)}%
                          </div>
                          <div className="text-sm text-gray-500">
                            {formatDate(item.createdAt)}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-center py-5">
                <AlertTriangle className="h-10 w-10 text-yellow-400 mx-auto" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No recent classifications</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Get started by uploading your first image for classification.
                </p>
                <div className="mt-6">
                  <Link
                    to="/upload"
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                  >
                    <Upload className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                    Upload Image
                  </Link>
                </div>
              </div>
            )}
          </div>
          {stats?.recentClassifications && stats.recentClassifications.length > 0 && (
            <div className="bg-gray-50 px-4 py-4 sm:px-6 rounded-b-lg">
              <div className="text-sm">
                <Link to="/history" className="font-medium text-primary-600 hover:text-primary-500 flex items-center justify-center">
                  View all classifications
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Classification Types */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <h3 className="text-lg leading-6 font-medium text-gray-900 flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-primary-600" />
              Classification Distribution
            </h3>
          </div>
          <div className="px-4 py-5 sm:p-6">
            {stats?.classificationsByType && stats.classificationsByType.length > 0 ? (
              <div className="space-y-4">
                {stats.classificationsByType.map((type) => (
                  <div key={type.type}>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-gray-900">{type.type}</div>
                      <div className="text-sm text-gray-500">
                        {type.count} ({type.percentage.toFixed(1)}%)
                      </div>
                    </div>
                    <div className="mt-2 w-full bg-gray-200 rounded-full h-2.5">
                      <div
                        className="bg-primary-600 h-2.5 rounded-full"
                        style={{ width: `${type.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-5">
                <AlertTriangle className="h-10 w-10 text-yellow-400 mx-auto" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No classification data</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Classification distribution will appear here once you have classified images.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;