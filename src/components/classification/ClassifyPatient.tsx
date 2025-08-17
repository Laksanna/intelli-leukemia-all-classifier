import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import axios from 'axios';
import { Search, Upload, FileText, Clock, Image as ImageIcon } from 'lucide-react';
import LoadingScreen from '../common/LoadingScreen'; // Assuming you have a LoadingScreen component
import { useLocation } from 'react-router-dom';

interface SearchFormData {
  patientId?: string;
  patientName?: string;
}

interface ClassificationResult {
  id: string;
  patientId?: string;
  patientName?: string;
  classification: string;
  confidence: number;
  createdAt: string;
  userName: string;
  userDesignation?: string;
  imageUrl?: string; // Include imageUrl in search results if needed for preview
  notes?: string; // Include notes
}

const ClassifyPatient: React.FC = () => {
  const { register, handleSubmit, formState: { errors } } = useForm<SearchFormData>();
  const [searchResults, setSearchResults] = useState<ClassificationResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [classifyingId, setClassifyingId] = useState<string | null>(null);
  const [classificationResult, setClassificationResult] = useState<ClassificationResult | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null); // State for displaying image
  const location = useLocation();

  const handleSearch = async (data: SearchFormData) => {
    if (!data.patientId && !data.patientName) {
      toast.error('Please enter either Patient ID or Patient Name to search.');
      return;
    }

    setIsLoading(true);
    setSearchResults([]); // Clear previous results
    setClassifyingId(null); // Clear classifying state
    setClassificationResult(null); // Clear displayed result
    setImageSrc(null); // Clear image

    console.log('Searching with data:', data);

    try {
      const token = localStorage.getItem('token');
      console.log('Retrieved token for search:', token ? 'Token found' : 'No token found'); // Log token status

      if (!token) {
        toast.error('Authentication token not found. Please log in again.');
        setIsLoading(false);
        return;
      }

      const response = await axios.get('/api/classifications/search', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        params: {
          patientId: data.patientId,
          patientName: data.patientName,
        },
      });

      setSearchResults(response.data);
       if (response.data.length === 0) {
           toast.info('No classifications found for the provided details.');
       }

    } catch (error: any) {
      console.error('Search error details:', error); // Log full error object
      let message = 'Failed to search classifications.';

      if (axios.isAxiosError(error)) {
           if (error.response) {
               // The request was made and the server responded with a status code
               // that falls out of the range of 2xx
               message = error.response.data?.message || `Server error: ${error.response.status}`;
           } else if (error.request) {
               // The request was made but no response was received
               message = 'Network error: Could not reach the server.';
           } else {
               // Something happened in setting up the request that triggered an Error
               message = error.message;
           }
      }

      toast.error(message);
      console.error('Search error:', error);
    } finally {
      setIsLoading(false);
    }
  };

   const handleClassify = async (classificationId: string) => {
       setIsLoading(true);
       setClassifyingId(classificationId); // Indicate which one is being classified
       setClassificationResult(null); // Clear previous result display
       setImageSrc(null); // Clear previous image

       try {
            const token = localStorage.getItem('token');
            if (!token) {
              throw new Error('Authentication token not found.');
            }

            const response = await axios.post(`/api/classification/${classificationId}/classify`, null, {
                 headers: {
                     'Authorization': `Bearer ${token}`,
                 },
            });

            // Fetch the updated classification data and image after classification is complete
            const updatedResultResponse = await axios.get(`/api/classification/${classificationId}`, {
                 headers: {
                     'Authorization': `Bearer ${token}`,
                 },
            });

            const updatedResult = updatedResultResponse.data;
            setClassificationResult(updatedResult); // Set the classified result to display

             // Update the search results list to reflect the change in status/classification
            setSearchResults(prevResults =>
                prevResults.map(item =>
                    item.id === classificationId ? { ...item, ...updatedResult } : item // Update with new data
                )
            );

            // Fetch image separately if imageUrl is available in the updated result
            if (updatedResult.imageUrl) {
                try {
                    const imageResponse = await fetch(updatedResult.imageUrl, {
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

            toast.success('Classification performed successfully!'); // Success toast for classification

       } catch (error: any) {
            const message = error.response?.data?.message || 'Failed to perform classification.';
            toast.error(message);
            console.error('Classification error:', error);
       } finally {
            setIsLoading(false);
            setClassifyingId(null); // Clear classifying state
       }
   };

   const handleDownloadReport = async (classificationId: string) => {
        setIsLoading(true); // Show loading for download

         try {
              const token = localStorage.getItem('token');
              if (!token) {
                throw new Error('Authentication token not found for report download');
              }

              const reportResponse = await fetch(`/api/classification/${classificationId}/report`, {
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
              let filename = `ALL_Report_${classificationId}.pdf`;
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
               toast.success('Report downloaded successfully.');

            } catch (err: any) {
              console.error('Error downloading report:', err);
              const message = err instanceof Error ? err.message : 'Failed to download report';
              toast.error(message);
            } finally {
                setIsLoading(false);
            }
   };

   // New function to fetch classification details and image
   const fetchClassificationDetails = async (classificationId: string) => {
       setIsLoading(true);
       setClassificationResult(null);
       setImageSrc(null);

       try {
           const token = localStorage.getItem('token');
           if (!token) {
               throw new Error('Authentication token not found.');
           }

           // Fetch classification details
           const response = await axios.get(`/api/classification/${classificationId}`, {
               headers: {
                   'Authorization': `Bearer ${token}`,
               },
           });

           const data = response.data;
           setClassificationResult(data); // Set the result to display

           // Fetch image if imageUrl is available
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

       } catch (error: any) {
           const message = error.response?.data?.message || 'Failed to fetch classification details.';
           toast.error(message);
           console.error('Fetch classification details error:', error);
       } finally {
           setIsLoading(false);
       }
   };

   const formatDate = (dateString: string) => {
       const date = new Date(dateString);
       return date.toLocaleString();
   };

  useEffect(() => {
    // Check for ?id= in the URL
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    if (id) {
      // If navigated with an id param, fetch that classification
      const fetchAndMaybeClassify = async () => {
        setIsLoading(true);
        try {
          const token = localStorage.getItem('token');
          if (!token) throw new Error('Authentication token not found.');
          // Fetch the classification
          const response = await axios.get(`/api/classification/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          const data = response.data;
          // Instead of setting search results here, maybe set a specific record to display
          // For now, we'll set it as a single search result for display consistency
          setSearchResults([data]); // Display this record in the search results area

          // *** REMOVE: Do NOT automatically classify here ***
          // if (!data.classification || data.classification === 'Uploaded') {
          //   await handleClassify(id);
          // } else {
          //   setClassificationResult(data);
          //   // Optionally fetch image if available
          //   if (data.imageUrl) {
          //     try {
          //       const imageResponse = await fetch(data.imageUrl, {
          //         headers: { 'Authorization': `Bearer ${token}` }
          //       });
          //       if (imageResponse.ok) {
          //         const imageBlob = await imageResponse.blob();
          //         const reader = new FileReader();
          //         reader.onloadend = () => {
          //           setImageSrc(reader.result as string);
          //         };
          //         reader.readAsDataURL(imageBlob);
          //       }
          //     } catch (imageError) {
          //       console.error('Error fetching image:', imageError);
          //     }
          //   }
          // }

            // If navigated directly, show the fetched result in the details section
            setClassificationResult(data);
             // Optionally fetch image if available for direct view
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
                     console.error('Error fetching image for direct view:', imageError);
                }
            }

        } catch (err) {
          toast.error('Failed to fetch classification for direct navigation.');
          console.error(err);
        } finally {
          setIsLoading(false);
        }
      };
      fetchAndMaybeClassify();
    }
    // When location.search changes, if there's no id, clear previous search results/details
    if (!id) {
         setSearchResults([]);
         setClassificationResult(null);
         setImageSrc(null);
    }

  }, [location.search]); // Depend on location.search to re-run when URL parameters change

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Classification of ALL type</h1>
      </div>

      <div className="bg-white shadow rounded-lg px-4 py-5 sm:p-6">
        <form onSubmit={handleSubmit(handleSearch)} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
          <div className="md:col-span-2">
            <label htmlFor="patientId" className="block text-sm font-medium text-gray-700">
              Search by Patient ID
            </label>
            <div className="mt-1">
              <input
                type="text"
                id="patientId"
                {...register('patientId')}
                className="shadow-sm focus:ring-primary-500 focus:border-primary-500 block w-full sm:text-sm border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="patientName" className="block text-sm font-medium text-gray-700">
              Search by Patient Name
            </label>
            <div className="mt-1">
              <input
                type="text"
                id="patientName"
                {...register('patientName')}
                className="shadow-sm focus:ring-primary-500 focus:border-primary-500 block w-full sm:text-sm border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div className="md:col-span-2 flex items-end">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center">
                  <Search className="h-4 w-4 mr-2 animate-spin" /> Searching...
                </span>
              ) : (
                <span className="flex items-center">
                  <Search className="h-4 w-4 mr-2" /> Search
                </span>
              )}
            </button>
          </div>
        </form>

        {/* Search Results Display */}
        {!isLoading && searchResults.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Search Results</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient ID</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient Name</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uploaded By</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uploaded On</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {searchResults.map((result) => (
                    <tr key={result.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{result.patientId}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{result.patientName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{result.userName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(result.createdAt)}</td>
                       <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                           {result.classification && result.classification !== 'Uploaded' ? (
                               <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Classified</span>
                           ) : (
                               <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Uploaded</span>
                           )}
                       </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {/* Corrected Action Button Logic */}
                        {result.classification === 'Uploaded' ? (
                             <button
                                onClick={() => handleClassify(result.id)}
                                disabled={classifyingId === result.id}
                                className="text-green-600 hover:text-green-900 px-2 py-1 border border-green-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {classifyingId === result.id ? (
                                    <span className="flex items-center">
                                      <Clock className="h-4 w-4 mr-1 animate-spin" /> Classifying...
                                    </span>
                                ) : (
                                     <span className="flex items-center">
                                         <ImageIcon className="h-4 w-4 mr-1" /> Classify Image
                                     </span>
                                )}
                            </button>
                        ) : ( /* If not Uploaded, assume Classified */
                           <div className="flex justify-end space-x-2">
                                <button
                                    onClick={() => fetchClassificationDetails(result.id)}
                                    className="text-blue-600 hover:text-blue-900 px-2 py-1 border border-blue-300 rounded-md"
                                >
                                    View Result
                                </button>
                                <button
                                    onClick={() => handleDownloadReport(result.id)}
                                    className="text-purple-600 hover:text-purple-900 px-2 py-1 border border-purple-300 rounded-md"
                                >
                                    <FileText className="h-4 w-4 mr-1 inline" /> Report
                                </button>
                            </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

         {/* Detailed Classification Result Display */}
         {classificationResult && (
             <div className="mt-8 bg-white shadow rounded-lg px-4 py-5 sm:p-6">
                 <h2 className="text-xl font-semibold text-gray-900 mb-4">Classification Result</h2>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div>
                         <p className="text-sm font-medium text-gray-500">Patient ID:</p>
                         <p className="mt-1 text-sm text-gray-900">{classificationResult.patientId}</p>
                     </div>
                      <div>
                         <p className="text-sm font-medium text-gray-500">Patient Name:</p>
                         <p className="mt-1 text-sm text-gray-900">{classificationResult.patientName || 'N/A'}</p>
                     </div>
                     <div>
                         <p className="text-sm font-medium text-gray-500">Classification:</p>
                         <p className="mt-1 text-sm text-gray-900">{classificationResult.classification}</p>
                     </div>
                     <div>
                         <p className="text-sm font-medium text-gray-500">Confidence:</p>
                         <p className="mt-1 text-sm text-gray-900">{classificationResult.confidence !== null ? `${classificationResult.confidence.toFixed(2)}%` : 'N/A'}</p>
                     </div>
                      <div>
                         <p className="text-sm font-medium text-gray-500">Uploaded By:</p>
                         <p className="mt-1 text-sm text-gray-900">{classificationResult.userName}</p>
                     </div>
                     <div>
                         <p className="text-sm font-medium text-gray-500">Uploaded On:</p>
                         <p className="mt-1 text-sm text-gray-900">{formatDate(classificationResult.createdAt)}</p>
                     </div>
                      <div className="md:col-span-2">
                         <p className="text-sm font-medium text-gray-500">Notes:</p>
                         <p className="mt-1 text-sm text-gray-900">{classificationResult.notes || 'None'}</p>
                     </div>
                     {imageSrc && (
                          <div className="md:col-span-2">
                             <p className="text-sm font-medium text-gray-500">Blood Sample Image:</p>
                             <img src={imageSrc} alt="Blood Sample" className="mt-2 max-w-full h-auto rounded-md shadow" />
                         </div>
                     )}
                 </div>
                  <div className="mt-6 flex justify-end space-x-4">
                       <button
                            onClick={() => handleDownloadReport(classificationResult.id)}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus\:ring-offset-2 focus\:ring-purple-500"
                        >
                            <FileText className="h-5 w-5 mr-2" /> Download Report
                        </button>
                  </div>
             </div>
         )}

        {isLoading && <LoadingScreen />} {/* Optional: Display a loading screen component */}

      </div>
    </div>
  );
};

export default ClassifyPatient; 