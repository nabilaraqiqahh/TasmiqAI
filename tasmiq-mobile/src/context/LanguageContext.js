import React, { createContext, useState, useContext, useEffect } from 'react';
import PlatformStorage from '../services/storage';
import { translations } from '../constants/translations';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState('en'); // 'en' or 'ms'

  useEffect(() => {
    // Load saved language on mount
    PlatformStorage.getItem('appLanguage').then(savedLang => {
      if (savedLang) setLanguage(savedLang);
    });
  }, []);

  const changeLanguage = async (newLang) => {
    setLanguage(newLang);
    await PlatformStorage.setItem('appLanguage', newLang);
  };

  const t = (path) => {
    const keys = path.split('.');
    let result = translations[language];
    for (const key of keys) {
      if (result[key]) {
        result = result[key];
      } else {
        return path; // Fallback to path if not found
      }
    }
    return result;
  };

  return (
    <LanguageContext.Provider value={{ language, changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);

