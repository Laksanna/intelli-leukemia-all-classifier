import React from 'react';
import { NavLink } from 'react-router-dom';
import { Microscope, Home, Upload, History, ClipboardList } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const Sidebar: React.FC = () => {
  const { currentUser } = useAuth();

  // Debug log for troubleshooting
  console.log('Sidebar currentUser:', currentUser);

  // Define navigation items for each designation
  let navigation = [];
  if (currentUser?.designation === 'Doctor' || currentUser?.designation === 'Nurse') {
    navigation = [
      { name: 'Dashboard', href: '/dashboard', icon: Home },
      { name: 'History', href: '/history', icon: History },
      { name: 'Classify', href: '/classify-patient', icon: ClipboardList },
    ];
  } else if (currentUser?.designation === 'Medical Technician') {
    navigation = [
      { name: 'Dashboard', href: '/dashboard', icon: Home },
      { name: 'Upload', href: '/upload', icon: Upload },
      { name: 'History', href: '/history', icon: History },
    ];
  } else {
    navigation = [
      { name: 'Dashboard', href: '/dashboard', icon: Home },
      { name: 'History', href: '/history', icon: History },
    ];
  }

  return (
    <div className="hidden md:flex md:flex-shrink-0">
      <div className="flex flex-col w-64">
        <div className="flex flex-col h-0 flex-1 border-r border-gray-200 bg-white">
          <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
            <div className="flex items-center flex-shrink-0 px-4">
              <Microscope className="h-8 w-8 text-primary-600" />
              <span className="ml-2 text-lg font-semibold text-gray-900">ALL Classifier</span>
            </div>
            <nav className="mt-5 flex-1 px-2 bg-white space-y-1">
              {navigation.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.href}
                  className={({ isActive }) =>
                    `group flex items-center px-2 py-2 text-sm font-medium rounded-md ${
                      isActive
                        ? 'bg-primary-50 text-primary-600'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        className={`mr-3 flex-shrink-0 h-5 w-5 ${
                          isActive ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500'
                        }`}
                        aria-hidden="true"
                      />
                      {item.name}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;