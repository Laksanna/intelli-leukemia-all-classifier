import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { FileText, Download, Search, Filter, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

interface Classification {
  id: number;
  image_path: string;
  prediction: string;
  confidence: number;
  created_at: string;
  patient_id?: string;
  notes?: string;
  status: 'pending' | 'reviewed' | 'reported';
}

const Classify: React.FC = () => {
  const { currentUser } = useAuth();
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedClassification, setSelectedClassification] = useState<Classification | null>(null);
  const [reportNotes, setReportNotes] = useState('');

  useEffect(() => {
    fetchClassifications();
  }, []);

  const fetchClassifications = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await axios.get('/api/classifications', {
        headers: { Authorization: `Bearer ${token}` }
      });

      setClassifications(response.data);
    } catch (err) {
      setError('Failed to fetch classifications');
      toast.error('Failed to load classifications');
      console.error('Error fetching classifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async (classificationId: number) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await axios.post(
        `/api/classifications/${classificationId}/report`,
        { notes: reportNotes },
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );

      // Create a download link for the PDF
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `classification-report-${classificationId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.success('Report generated successfully');
      
      // Update the classification status
      setClassifications(prev => 
        prev.map(c => 
          c.id === classificationId 
            ? { ...c, status: 'reported', notes: reportNotes }
            : c
        )
      );
      
      setSelectedClassification(null);
      setReportNotes('');
    } catch (err) {
      toast.error('Failed to generate report');
      console.error('Error generating report:', err);
    }
  };

  const updateClassificationStatus = async (classificationId: number, status: 'pending' | 'reviewed' | 'reported') => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      await axios.patch(
        `/api/classifications/${classificationId}/status`,
        { status },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setClassifications(prev =>
        prev.map(c =>
          c.id === classificationId ? { ...c, status } : c
        )
      );

      toast.success('Status updated successfully');
    } catch (err) {
      toast.error('Failed to update status');
      console.error('Error updating status:', err);
    }
  };

  const filteredClassifications = classifications.filter(classification => {
    const matchesSearch = 
      classification.prediction.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (classification.patient_id && classification.patient_id.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || classification.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchClassifications}
          className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Classification Management</h1>
        <button
          onClick={fetchClassifications}
          className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </button>
      </div>

      {/* Search and Filter */}
      <div className="mb-6 flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by prediction or patient ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        </div>
        <div className="w-full md:w-48">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="reviewed">Reviewed</option>
            <option value="reported">Reported</option>
          </select>
        </div>
      </div>

      {/* Classifications List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Prediction
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Confidence
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredClassifications.map((classification) => (
                <tr key={classification.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(classification.created_at), 'MMM d, yyyy HH:mm')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {classification.prediction}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {(classification.confidence * 100).toFixed(2)}%
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full
                      ${classification.status === 'reported' ? 'bg-green-100 text-green-800' :
                        classification.status === 'reviewed' ? 'bg-blue-100 text-blue-800' :
                        'bg-yellow-100 text-yellow-800'}`}>
                      {classification.status.charAt(0).toUpperCase() + classification.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setSelectedClassification(classification)}
                        className="text-primary-600 hover:text-primary-900"
                      >
                        <FileText className="w-5 h-5" />
                      </button>
                      {classification.status === 'reviewed' && (
                        <button
                          onClick={() => generateReport(classification.id)}
                          className="text-green-600 hover:text-green-900"
                        >
                          <Download className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Classification Details Modal */}
      {selectedClassification && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Classification Details</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Prediction</p>
                  <p className="mt-1">{selectedClassification.prediction}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Confidence</p>
                  <p className="mt-1">{(selectedClassification.confidence * 100).toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Date</p>
                  <p className="mt-1">{format(new Date(selectedClassification.created_at), 'MMM d, yyyy HH:mm')}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Notes</p>
                  <textarea
                    value={reportNotes}
                    onChange={(e) => setReportNotes(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                    rows={4}
                    placeholder="Add notes for the report..."
                  />
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => {
                      setSelectedClassification(null);
                      setReportNotes('');
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  {selectedClassification.status === 'pending' && (
                    <button
                      onClick={() => updateClassificationStatus(selectedClassification.id, 'reviewed')}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      Mark as Reviewed
                    </button>
                  )}
                  {selectedClassification.status === 'reviewed' && (
                    <button
                      onClick={() => generateReport(selectedClassification.id)}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                    >
                      Generate Report
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Classify; 