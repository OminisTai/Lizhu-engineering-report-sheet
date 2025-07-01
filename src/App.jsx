import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection } from 'firebase/firestore';

// Custom Modal Component to replace browser alerts
const Modal = ({ message, onClose }) => {
  if (!message) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-auto">
        <p className="text-gray-800 text-lg mb-4 text-center">{message}</p>
        <div className="flex justify-center">
          <button
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300 ease-in-out"
          >
            確認
          </button>
        </div>
      </div>
    </div>
  );
};

// Main App component
const App = () => {
  // Firebase state
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalMessage, setModalMessage] = useState(null);

  // State to hold all the document data
  const [documentData, setDocumentData] = useState({
    header: {
      ownerName: '',
      poNo: '',
      projectName: '',
      supervisor: '',
      entryTime: '09:00',
      exitTime: '17:00',
      date: new Date().toISOString().split('T')[0],
    },
    pages: [
      {
        id: 'page-1',
        mainTitle: '',
        photos: Array(4).fill({ caption: '', imageUrl: '' }) // 4 photos for the first page
      }
    ]
  });

  // --- START Firebase Configuration for GitHub Pages ---
  // IMPORTANT: Replaced with your actual Firebase project configuration from Firebase Console.
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBjXOvhutQEdcImIeDF3QV00yOKAInSy-M",
    authDomain: "lizhu-engineering-report-sheet.firebaseapp.com",
    projectId: "lizhu-engineering-report-sheet",
    storageBucket: "lizhu-engineering-report-sheet.firebasestorage.app",
    messagingSenderId: "370631437851",
    appId: "1:370631437851:web:f1e8985bae9bfbe84212be",
    // measurementId is not directly used in this app's logic, so it's omitted from FIREBASE_CONFIG
    // If you need analytics, you would initialize it separately like:
    // const analytics = getAnalytics(app);
  };
  // --- END Firebase Configuration ---

  // Effect for Firebase initialization and authentication
  useEffect(() => {
    const app = initializeApp(FIREBASE_CONFIG);
    const firestore = getFirestore(app);
    const firebaseAuth = getAuth(app);

    setDb(firestore);
    setAuth(firebaseAuth);

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      if (user) {
        setUserId(user.uid);
        setLoading(false);
      } else {
        try {
          // 在 GitHub Pages 環境下，我們通常會讓使用者匿名登入來共享資料
          await signInAnonymously(firebaseAuth);
        } catch (error) {
          console.error("Firebase authentication failed:", error);
          setModalMessage("Firebase 認證失敗，請檢查網路連線或稍後再試。");
          setLoading(false);
        }
      }
    });

    return () => unsubscribe(); // Cleanup auth listener
  }, []);

  // Effect for fetching and listening to document data from Firestore
  useEffect(() => {
    if (db && userId) {
      // --- START Firestore Data Path for Multi-User Sharing ---
      // 將資料儲存在一個公開且固定的文件路徑，以實現多人共享
      // 'mainDeliveryRecord' 是固定的文件 ID，所有使用者都會讀取和寫入這個文件
      const docRef = doc(collection(db, `artifacts/${FIREBASE_CONFIG.appId}/public/data/deliveryRecords`), 'mainDeliveryRecord');
      // --- END Firestore Data Path ---

      const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const fetchedData = docSnap.data();
          // Merge fetched data with current state, preserving imageUrls
          setDocumentData(prevData => {
            // 確保 fetchedData.pages 存在且是陣列
            const fetchedPages = Array.isArray(fetchedData.pages) ? fetchedData.pages : [];
            const newPages = fetchedPages.map((fetchedPage, pageIndex) => {
              const prevPage = prevData.pages[pageIndex];
              // 確保 fetchedPage.photos 存在且是陣列
              const fetchedPhotos = Array.isArray(fetchedPage.photos) ? fetchedPage.photos : [];
              return {
                ...fetchedPage,
                mainTitle: fetchedPage.mainTitle || '', // 確保 mainTitle 存在
                photos: fetchedPhotos.map((fetchedPhoto, photoIndex) => {
                  const prevPhoto = prevPage?.photos[photoIndex];
                  return {
                    caption: fetchedPhoto.caption || '',
                    imageUrl: prevPhoto?.imageUrl || '' // Preserve existing imageUrl if not fetched
                  };
                })
              };
            });
            return {
              header: fetchedData.header || prevData.header,
              pages: newPages.length > 0 ? newPages : [ // 如果沒有頁面，則初始化一個空頁面
                {
                  id: 'page-1',
                  mainTitle: '',
                  photos: Array(4).fill({ caption: '', imageUrl: '' })
                }
              ]
            };
          });
        } else {
          // If document doesn't exist, create it with initial data
          console.log("No document found, creating initial document for shared data.");
          setDoc(docRef, documentData)
                .catch(error => console.error("Error creating initial document:", error));
            }
            setLoading(false);
          }, (error) => {
            console.error("Error listening to document:", error);
            setModalMessage("無法從雲端載入資料，請檢查網路連線。");
            setLoading(false);
          });

          return () => unsubscribe(); // Cleanup snapshot listener
        }
      }, [db, userId]); // Re-run when db or userId changes

      // Save data to Firestore whenever documentData changes (debounced)
      const saveTimeoutRef = useRef(null);
      useEffect(() => {
        if (db && userId && !loading) { // Only save if Firebase is ready and not in initial loading phase
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
          }
          saveTimeoutRef.current = setTimeout(() => {
            // --- START Firestore Data Path for Multi-User Sharing (Save) ---
            const docRef = doc(collection(db, `artifacts/${FIREBASE_CONFIG.appId}/public/data/deliveryRecords`), 'mainDeliveryRecord');
            // --- END Firestore Data Path (Save) ---

            // Create a copy of documentData to remove imageUrls before saving
            const dataToSave = {
              header: documentData.header,
              pages: documentData.pages.map(page => ({
                ...page,
                mainTitle: page.mainTitle,
                photos: page.photos.map(photo => ({
                  caption: photo.caption,
                  // imageUrl is deliberately excluded from Firestore to prevent size issues.
                }))
              }))
            };
            setDoc(docRef, dataToSave)
              .catch(error => {
                console.error("Failed to save data to Firestore:", error);
                setModalMessage("資料保存失敗，請檢查網路連線或稍後再試。");
              });
          }, 1000); // Debounce for 1 second

          return () => {
            if (saveTimeoutRef.current) {
              clearTimeout(saveTimeoutRef.current);
            }
          };
        }
      }, [documentData, db, userId, loading]);

      // Handle header input changes
      const handleHeaderChange = (e) => {
        const { name, value } = e.target;
        setDocumentData(prevData => ({
          ...prevData,
          header: {
            ...prevData.header,
            [name]: value
          }
        }));
      };

      // Handle page's main title changes
      const handlePageMainTitleChange = (pageIndex, value) => {
        setDocumentData(prevData => {
          const newPages = [...prevData.pages];
          if (newPages[pageIndex]) {
            newPages[pageIndex] = {
              ...newPages[pageIndex],
              mainTitle: value
            };
          }
          return { ...prevData, pages: newPages };
        });
      };

      // Handle photo caption changes
      const handlePhotoCaptionChange = (pageIndex, photoIndex, value) => {
        setDocumentData(prevData => {
          const newPages = [...prevData.pages];
          if (newPages[pageIndex] && newPages[pageIndex].photos[photoIndex]) {
            newPages[pageIndex].photos[photoIndex] = {
              ...newPages[pageIndex].photos[photoIndex],
              caption: value
            };
          }
          return { ...prevData, pages: newPages };
        });
      };

      // Function to copy caption from the previous photo based on page and photo index
      const handleCopyCaptionFromPrevious = (pageIndex, photoIndex) => {
        let sourceCaption = '';

        if (photoIndex === 0) { // If it's the first photo on the current page
          if (pageIndex === 0) {
            setModalMessage('上一格未輸入');
            return;
          } else {
            // If it's the first photo on a subsequent page (e.g., page 2, photo 1)
            // Copy from the last photo of the previous page (e.g., page 1, last photo)
            const prevPage = documentData.pages[pageIndex - 1];
            if (prevPage && prevPage.photos.length > 0) {
              sourceCaption = prevPage.photos[prevPage.photos.length - 1].caption;
            }
          }
        } else {
          // If it's not the first photo on the current page, copy from the previous photo on the same page
          sourceCaption = documentData.pages[pageIndex].photos[photoIndex - 1].caption;
        }

        if (!sourceCaption) {
          setModalMessage('上一格未輸入');
          return;
        }

        // Update the current photo's caption
        setDocumentData(prevData => {
          const newPages = [...prevData.pages];
          if (newPages[pageIndex] && newPages[pageIndex].photos[photoIndex]) {
            newPages[pageIndex].photos[photoIndex] = {
              ...newPages[pageIndex].photos[photoIndex],
              caption: sourceCaption
            };
          }
          return { ...prevData, pages: newPages };
        });
      };

      // Function to copy main title from the previous page
      const handleCopyMainTitleFromPreviousPage = (pageIndex) => {
        if (pageIndex === 0) {
          setModalMessage('上一個主要標題未輸入');
          return;
        }

        const previousPageMainTitle = documentData.pages[pageIndex - 1]?.mainTitle;

        if (!previousPageMainTitle) {
          setModalMessage('上一個主要標題未輸入');
          return;
        }

        // Update the current page's main title
        setDocumentData(prevData => {
          const newPages = [...prevData.pages];
          if (newPages[pageIndex]) {
            newPages[pageIndex] = {
              ...newPages[pageIndex],
              mainTitle: previousPageMainTitle
            };
          }
          return { ...prevData, pages: newPages };
        });
      };

      // Handle image file upload
      const handleImageUpload = (pageIndex, photoIndex, e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
            setDocumentData(prevData => {
              const newPages = [...prevData.pages];
              if (newPages[pageIndex] && newPages[pageIndex].photos[photoIndex]) {
                newPages[pageIndex].photos[photoIndex] = {
                  ...newPages[pageIndex].photos[photoIndex],
                  imageUrl: reader.result // Base64 encoded image (only for current session display)
                };
              }
              return { ...prevData, pages: newPages };
            });
          };
          reader.readAsDataURL(file);
        }
      };

      // Add a new page
      const addPage = useCallback(() => {
        setDocumentData(prevData => {
          const newPageId = `page-${prevData.pages.length + 1}`;
          const newPhotosCount = 6; // All subsequent pages (from page 2 onwards) will have 6 photos
          const newPage = {
            id: newPageId,
            mainTitle: '',
            photos: Array(newPhotosCount).fill({ caption: '', imageUrl: '' })
          };
          return {
            ...prevData,
            pages: [...prevData.pages, newPage]
          };
        });
      }, []);

      // Remove a page
      const removePage = useCallback((pageIndex) => {
        setDocumentData(prevData => {
          const newPages = prevData.pages.filter((_, idx) => idx !== pageIndex);
          return {
            ...prevData,
            pages: newPages
          };
        });
      }, []);

      // Handle print action (prints all pages)
      const handlePrint = () => {
        window.print();
      };

      // Handle Save as Word (placeholder - not directly feasible for complex documents in pure frontend)
      const handleSaveAsWord = () => {
        setModalMessage('另存新檔為 Word 檔案的功能在純前端實作較為複雜。建議您可以透過瀏覽器的列印功能，選擇「另存為 PDF」來保存文件。');
      };

      if (loading) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="flex items-center space-x-2 text-gray-700">
              <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>載入中...</span>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen flex flex-col items-center bg-gray-100 p-4 font-sans antialiased text-gray-800">
          <Modal message={modalMessage} onClose={() => setModalMessage(null)} />

          {/* User ID Display - For shared data, userId might not be directly relevant to distinguish users */}
          {userId && (
            <div className="fixed top-2 right-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full z-50 no-print">
              User ID: {userId}
            </div>
          )}

          {/* Document Pages Container */}
          <div className="document-container w-full max-w-[210mm]"> {/* Added max-w to constrain width */}
            {documentData.pages.map((page, pageIndex) => (
              <div
                key={page.id}
                className="a4-page bg-white shadow-xl rounded-lg mb-8 p-6 print:p-0 print:m-0 print:shadow-none"
              >
                {/* Page Header (Only for the first page) */}
                {pageIndex === 0 && (
                  <div className="text-center mb-6 border-b pb-4">
                    <h1 className="text-2xl font-bold mb-2">力築工程有限公司</h1>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left text-sm">
                      <div className="flex items-center">
                        <label className="font-semibold w-28 flex-shrink-0">業主名稱:</label>
                        <input
                          type="text"
                          name="ownerName"
                          value={documentData.header.ownerName}
                          onChange={handleHeaderChange}
                          placeholder="請輸入業主名稱"
                          className="flex-grow border-b border-gray-300 focus:outline-none focus:border-blue-500 rounded-sm px-2 py-1"
                        />
                      </div>
                      <div className="flex items-center">
                        <label className="font-semibold w-28 flex-shrink-0">案件編號:</label>
                        <input
                          type="text"
                          name="poNo"
                          value={documentData.header.poNo}
                          onChange={handleHeaderChange}
                          placeholder="P/O NO:"
                          className="flex-grow border-b border-gray-300 focus:outline-none focus:border-blue-500 rounded-sm px-2 py-1"
                        />
                      </div>
                      <div className="flex items-center">
                        <label className="font-semibold w-28 flex-shrink-0">工程名稱:</label>
                        <input
                          type="text"
                          name="projectName"
                          value={documentData.header.projectName}
                          onChange={handleHeaderChange}
                          placeholder="請輸入工程名稱"
                          className="flex-grow border-b border-gray-300 focus:outline-none focus:border-blue-500 rounded-sm px-2 py-1"
                        />
                      </div>
                      <div className="flex items-center">
                        <label className="font-semibold w-28 flex-shrink-0">承攬商監工:</label>
                        <input
                          type="text"
                          name="supervisor"
                          value={documentData.header.supervisor}
                          onChange={handleHeaderChange}
                          placeholder="請輸入監工名"
                          className="flex-grow border-b border-gray-300 focus:outline-none focus:border-blue-500 rounded-sm px-2 py-1"
                        />
                      </div>
                      <div className="flex items-center">
                        <label className="font-semibold w-28 flex-shrink-0">日期:</label>
                        <input
                          type="date"
                          name="date"
                          value={documentData.header.date}
                          onChange={handleHeaderChange}
                          className="flex-grow border-b border-gray-300 focus:outline-none focus:border-blue-500 rounded-sm px-2 py-1"
                        />
                      </div>
                      <div className="flex items-center invisible md:visible"></div> {/* Placeholder for alignment on larger screens */}

                      <div className="flex items-center">
                        <label className="font-semibold w-28 flex-shrink-0">入廠時間:</label>
                        <input
                          type="time"
                          name="entryTime"
                          value={documentData.header.entryTime}
                          onChange={handleHeaderChange}
                          className="flex-grow border-b border-gray-300 focus:outline-none focus:border-blue-500 rounded-sm px-2 py-1"
                        />
                      </div>
                      <div className="flex items-center">
                        <label className="font-semibold w-28 flex-shrink-0">離廠時間:</label>
                        <input
                          type="time"
                          name="exitTime"
                          value={documentData.header.exitTime}
                          onChange={handleHeaderChange}
                          className="flex-grow border-b border-gray-300 focus:outline-none focus:border-blue-500 rounded-sm px-2 py-1"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Page Main Title Section - Now applied per page */}
                <div className="w-full text-center mb-2">
                  <textarea
                    rows="1"
                    value={page.mainTitle}
                    onChange={(e) => handlePageMainTitleChange(pageIndex, e.target.value)}
                    className="w-full text-center font-bold text-xl mb-1 border-b border-gray-300 focus:outline-none focus:border-blue-500 rounded-sm resize-none overflow-hidden print:border-none print:resize-none"
                    placeholder="請輸入本頁圖片主要標題"
                    onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = (e.target.scrollHeight) + 'px'; }}
                  />
                  {pageIndex > 0 && (
                    <div className="flex justify-center mt-1 mb-3 no-print">
                      <button
                        onClick={() => handleCopyMainTitleFromPreviousPage(pageIndex)}
                        className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs px-2 py-1 rounded-full transition duration-200 ease-in-out"
                        title="複製上一頁的主要標題"
                      >
                        同上個主標
                      </button>
                    </div>
                  )}
                </div>

                {/* Photo Grid Section */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {page.photos.map((photo, photoIndex) => (
                    <div key={photoIndex} className="flex flex-col items-center border border-gray-200 rounded-md p-3 shadow-sm relative">
                      {/* Image Upload and Display */}
                      <div className="w-full bg-gray-100 border border-gray-300 rounded-md overflow-hidden flex items-center justify-center relative h-48 sm:h-56 md:h-64 lg:h-72 mb-2">
                        {photo.imageUrl ? (
                          <img
                            src={photo.imageUrl}
                            alt={`Photo ${photoIndex + 1}`}
                            className="object-contain w-full h-full"
                            onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/400x300/e2e8f0/64748b?text=圖片載入失敗"; }}
                          />
                        ) : (
                          <span className="text-gray-500 text-sm">點擊上傳圖片</span>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageUpload(pageIndex, photoIndex, e)}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </div>

                      {/* Photo caption */}
                      <div className="w-full">
                        <textarea
                          rows="2"
                          value={photo.caption}
                          onChange={(e) => handlePhotoCaptionChange(pageIndex, photoIndex, e.target.value)}
                          className="w-full text-center text-sm text-gray-700 border border-gray-300 rounded-md p-1 focus:outline-none focus:border-blue-500 resize-none overflow-hidden"
                          placeholder="請輸入圖片下標"
                          onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = (e.target.scrollHeight) + 'px'; }}
                        />
                        {!(pageIndex === 0 && photoIndex === 0) && (
                          <div className="flex justify-center mt-1 no-print">
                            <button
                              onClick={() => handleCopyCaptionFromPrevious(pageIndex, photoIndex)}
                              className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs px-2 py-1 rounded-full transition duration-200 ease-in-out"
                              title="複製上一張圖片的下標"
                            >
                              同上
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Page Navigation / Add/Remove Page Buttons (Hidden on print media) */}
                <div className="flex justify-between items-center mt-6 pt-4 border-t no-print">
                  {pageIndex > 0 && (
                    <button
                      onClick={() => removePage(pageIndex)}
                      className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300 ease-in-out transform hover:scale-105"
                    >
                      移除此頁
                    </button>
                  )}
                  <div className="flex space-x-2 ml-auto"> {/* Use ml-auto to push buttons to the right */}
                    <button
                      onClick={handlePrint}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                    >
                      列印
                    </button>
                    <button
                      onClick={handleSaveAsWord}
                      className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                    >
                      另存新檔
                    </button>
                    {pageIndex === documentData.pages.length - 1 && (
                      <button
                        onClick={addPage}
                        className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300 ease-in-out transform hover:scale-105"
                      >
                        新增下一頁
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Global Styles for A4 Print Layout */}
          <style>{`
            .a4-page {
              width: 210mm; /* A4 width */
              min-height: 297mm; /* A4 height */
              margin: 0 auto;
              box-sizing: border-box; /* Include padding and border in the element's total width and height */
              display: flex;
              flex-direction: column;
              page-break-after: always; /* Force page break after each A4 page */
            }

            .a4-page:last-of-type {
              page-break-after: auto; /* No page break after the last page */
            }

            /* Adjustments for print media */
            @media print {
              body {
                margin: 0 !important;
                padding: 0 !important;
                -webkit-print-color-adjust: exact; /* Ensure background colors and images are printed */
                color-adjust: exact;
              }
              .document-container {
                margin: 0 !important;
                padding: 0 !important;
              }
              .a4-page {
                box-shadow: none !important;
                border: none !important;
                margin: 0 !important;
                padding: 10mm 15mm !important; /* Adjust padding for A4 margins */
              }
              .no-print {
                display: none !important;
              }
              input, textarea {
                border: none !important; /* Remove borders from inputs/textareas for print */
                border-bottom: 1px solid #ccc !important; /* Keep subtle underline for inputs */
                padding: 0 !important;
                resize: none !important;
                overflow: hidden !important;
              }
              textarea {
                height: auto !important; /* Let content determine height */
              }
              /* Ensure images print clearly */
              img {
                max-width: 100% !important;
                height: auto !important;
                display: block !important;
              }
              .flex-shrink-0 { /* Prevent labels from shrinking */
                flex-shrink: 0;
              }
            }
          `}</style>
        </div>
      );
    };

    export default App;
    