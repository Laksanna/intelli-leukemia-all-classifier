import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import LoadingScreen from '../common/LoadingScreen';

interface ClassificationData {
  id: string;
  imageUrl: string;
  classification: string;
  confidence: number;
  createdAt: string;
  patientId?: string;
  notes?: string;
  userName?: string;
}

const ClassificationResult: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClassificationData | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  useEffect(() => {
    const fetchResult = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('Authentication token not found');
        }

        const response = await fetch(`/api/classification/${id}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Failed to fetch classification result' }));
          throw new Error(errorData.message || 'Failed to fetch classification result');
        }

        const data = await response.json();
        console.log('Fetched classification data:', data);
        setResult(data);

        if (data.imageUrl) {
          try {
            const imageResponse = await fetch(data.imageUrl, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });

            if (!imageResponse.ok) {
              throw new Error(`Failed to fetch image: ${imageResponse.status}`);
            }

            const imageBlob = await imageResponse.blob();
            const reader = new FileReader();
            reader.onloadend = () => {
              setImageSrc(reader.result as string);
            };
            reader.readAsDataURL(imageBlob);
          } catch (imageError) {
            console.error('Error fetching image:', imageError);
          }
        }
      } catch (err) {
        console.error('Error fetching classification result:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchResult();
    }
  }, [id]);

  const handleDownloadReport = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found for report download');
      }

      const reportResponse = await fetch(`/api/classification/${id}/report`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!reportResponse.ok) {
        const errorData = await reportResponse.json().catch(() => ({ message: 'Failed to download report' }));
        throw new Error(errorData.message || 'Failed to download report');
      }

      const blob = await reportResponse.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const contentDisposition = reportResponse.headers.get('Content-Disposition');
      let filename = `ALL_Report_${id}.pdf`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading report:', err);
      setError(err instanceof Error ? err.message : 'Failed to download report');
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex items-center justify-center">
                <AlertCircle className="h-12 w-12 text-red-500" />
                <h3 className="ml-3 text-lg font-medium text-red-800">Error Loading Result</h3>
              </div>
              <div className="mt-4 text-center text-sm text-gray-600">{error}</div>
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                >
                  <ArrowLeft className="h-5 w-5 mr-2" />
                  Go Back
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900">No Result Found</h3>
                <p className="mt-2 text-sm text-gray-600">
                  The classification result you're looking for could not be found.
                </p>
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus::ring-offset-2 focus:ring-primary-500"
                  >
                    <ArrowLeft className="h-5 w-5 mr-2" />
                    Go Back
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white shadow sm:rounded-lg overflow-hidden">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Classification Result</h2>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                <ArrowLeft className="h-5 w-5 mr-2" />
                Back
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="aspect-w-16 aspect-h-9">
                {imageSrc ? (
                  <img
                    src={imageSrc}
                    alt="Classified Image"
                    className="object-cover rounded-lg shadow-lg"
                  />
                ) : (result.imageUrl ? (
                  <div className="flex items-center justify-center h-60 bg-gray-200 rounded-lg text-gray-500">
                    Loading Image...
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-60 bg-gray-200 rounded-lg text-gray-500">
                    Image Not Available
                  </div>
                ))}
              </div>
              
              <div className="bg-gray-50 px-4 py-5 sm:rounded-lg sm:p-6">
                <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Patient ID</dt>
                    <dd className="mt-1 text-lg font-semibold text-gray-900">{result.patientId || 'N/A'}</dd>
                  </div>
                  
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Classification</dt>
                    <dd className="mt-1 text-lg font-semibold text-gray-900">{result.classification}</dd>
                  </div>
                  
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Confidence</dt>
                    <dd className="mt-1 text-lg font-semibold text-gray-900">
                      {(result.confidence).toFixed(2)}%
                    </dd>
                  </div>
                  
                  <div className="sm:col-span-2">
                    <dt className="text-sm font-medium text-gray-500">Timestamp</dt>
                    <dd className="mt-1 text-sm text-gray-900">{new Date(result.createdAt).toLocaleString()}</dd>
                  </div>
                  {result.notes && (
                    <div className="sm:col-span-2">
                      <dt className="text-sm font-medium text-gray-500">Notes</dt>
                      <dd className="mt-1 text-sm text-gray-900">{result.notes}</dd>
                    </div>
                  )}
                  {result.userName && (
                    <div className="sm:col-span-2">
                      <dt className="text-sm font-medium text-gray-500">Physician</dt>
                      <dd className="mt-1 text-sm text-gray-900">{result.userName}</dd>
                    </div>
                  )}
                </dl>
              </div>

              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={handleDownloadReport}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Download PDF Report
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClassificationResult;