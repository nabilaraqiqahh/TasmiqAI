import React, { createContext, useState, useContext, useEffect } from 'react';
import PlatformStorage from '../services/storage';
import { Colors } from '../constants/colors';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    PlatformStorage.getItem('isDarkMode').then(saved => {
      if (saved !== null) setIsDark(JSON.parse(saved));
    });
  }, []);

  const toggleTheme = async () => {
    const newValue = !isDark;
    setIsDark(newValue);
    await PlatformStorage.setItem('isDarkMode', JSON.stringify(newValue));
  };

  const colors = isDark ? Colors.dark : Colors.light;

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

