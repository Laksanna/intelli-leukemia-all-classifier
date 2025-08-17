import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { History, Search, FileBarChart2, ArrowUpDown, ChevronRight, FileText } from 'lucide-react';
import axios from 'axios';

interface ClassificationRecord {
  id: string;
  patientId: string;
  patientName: string;
  classification: string | null;
  confidence: number | null;
  createdAt: string;
  userName: string;
}

const ClassificationHistory: React.FC = () => {
  const [records, setRecords] = useState<ClassificationRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<'createdAt' | 'patientId' | 'patientName' | 'userName' | 'classification' | 'confidence'>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      console.log('Fetching classification history...');
      const response = await axios.get('/api/classification/history', {
         headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
         }
      });
      console.log('History fetch successful. Data received:', response.data);
      setRecords(response.data);
    } catch (error) {
      console.error('Error fetching classification history:', error);
      toast.error('Failed to load classification history');
       setRecords([]);
    } finally {
      setLoading(false);
      console.log('Finished fetching classification history. Loading set to false.');
    }
  };

  const handleSort = (field: 'createdAt' | 'patientId' | 'patientName' | 'userName' | 'classification' | 'confidence') => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const displayedRecords = useMemo(() => {
    let currentRecords = [...records];

    if (searchTerm.trim()) {
    const term = searchTerm.toLowerCase();
      currentRecords = currentRecords.filter(
      record => 
        record.patientId.toLowerCase().includes(term) ||
          record.classification?.toLowerCase().includes(term) ||
          record.patientName.toLowerCase().includes(term) ||
          record.userName.toLowerCase().includes(term)
    );
    }

    const sorted = currentRecords.sort((a, b) => {
      if (sortField === 'createdAt') {
        return sortDirection === 'asc' 
          ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      
      if (sortField === 'confidence') {
        if (a.confidence === null && b.confidence === null) return 0;
        if (a.confidence === null) return sortDirection === 'asc' ? -1 : 1;
        if (b.confidence === null) return sortDirection === 'asc' ? 1 : -1;

        return sortDirection === 'asc' 
          ? a.confidence - b.confidence
          : b.confidence - a.confidence;
      }
      
      if (sortField === 'patientId' || sortField === 'patientName' || sortField === 'userName' || sortField === 'classification') {
        const aValue = a[sortField]?.toLowerCase() || '';
        const bValue = b[sortField]?.toLowerCase() || '';
      
      if (sortDirection === 'asc') {
        return aValue.localeCompare(bValue);
      } else {
        return bValue.localeCompare(aValue);
      }
      }

      return 0;
    });

    return sorted;

  }, [records, searchTerm, sortField, sortDirection]);

  const getConfidenceColor = (confidence: number | null) => {
    if (confidence === null) return 'text-gray-500';
    if (confidence >= 90) return 'text-green-600';
    if (confidence >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 flex items-center">
          <History className="h-6 w-6 mr-2 text-primary-600" />
          Classification History
        </h1>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 border-b border-gray-200 sm:px-6">
          <div className="flex flex-wrap items-center justify-between">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Past Classifications
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
                placeholder="Search by patient ID, name, or type"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-center py-10">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-700">Loading history...</p>
            </div>
          ) : displayedRecords.length === 0 ? (
            <div className="text-center py-10">
              <FileBarChart2 className="h-12 w-12 text-gray-400 mx-auto" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No classifications found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm ? 'Try adjusting your search term' : 'No classification history available'}
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
                  <th 
                    scope="col" 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSort('createdAt')}
                  >
                    <div className="flex items-center">
                      Date/Time
                      <ArrowUpDown className="ml-1 h-4 w-4" />
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSort('patientId')}
                  >
                    <div className="flex items-center">
                      Patient ID
                      <ArrowUpDown className="ml-1 h-4 w-4" />
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSort('patientName')}
                  >
                    <div className="flex items-center">
                      Patient Name
                      <ArrowUpDown className="ml-1 h-4 w-4" />
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSort('userName')}
                  >
                    <div className="flex items-center">
                      Uploaded By
                      <ArrowUpDown className="ml-1 h-4 w-4" />
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSort('classification')}
                  >
                    <div className="flex items-center">
                      Classification
                      <ArrowUpDown className="ml-1 h-4 w-4" />
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSort('confidence')}
                  >
                    <div className="flex items-center">
                      Confidence
                      <ArrowUpDown className="ml-1 h-4 w-4" />
                    </div>
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {displayedRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(record.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {record.patientId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {record.patientName || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {record.userName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {record.classification && record.classification !== 'Uploaded' ? 'Classified' : 'Uploaded'}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${record.classification === 'Uploaded' ? 'text-gray-500' : getConfidenceColor(record.confidence)} font-medium`}>
                      {record.classification === 'Uploaded' ? 'N/A' : (record.confidence !== null ? `${record.confidence.toFixed(1)}%` : 'N/A')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {(!record.classification || record.classification === 'Uploaded') ? (
                        <Link
                          to={`/classification/${record.id}`}
                          className="text-green-600 hover:text-green-900 inline-flex items-center"
                        >
                          Classify <ChevronRight className="ml-1 h-4 w-4" />
                        </Link>
                      ) : (
                        <>
                          <Link
                            to={`/classification/${record.id}`}
                            className="text-blue-600 hover:text-blue-900 inline-flex items-center"
                          >
                            View Result <ChevronRight className="ml-1 h-4 w-4" />
                          </Link>
                          <button
                            onClick={() => handleDownloadReport && handleDownloadReport(record.id)}
                            className="ml-2 text-purple-600 hover:text-purple-900 inline-flex items-center border border-purple-300 rounded-md px-2 py-1"
                          >
                            <FileText className="h-4 w-4 mr-1 inline" /> Report
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClassificationHistory;