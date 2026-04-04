import React from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Settings as SettingsIcon, Calendar, FileEdit } from 'lucide-react';
import { useAppContext, AppProvider } from './store/AppContext';
import { Lock } from 'lucide-react';

// 頁面組件匯入
import BasicSettings from './pages/BasicSettings';
import CurriculumPlan from './pages/CurriculumPlan';
import IgpAdjustments from './pages/IgpAdjustments';

const Sidebar = () => {
  const { state } = useAppContext();
  const { settings, lessonsA1 } = state;

  // 1. 檢查基本設定是否完成
  const isBasicSettingsDone = !!(
    settings.academicYear && 
    settings.grade && 
    settings.courses[0]?.mode
  );

  // 2. 檢查課程規劃是否完成 (至少有一週有單元重點)
  const isPlanningDone = lessonsA1.length > 0 && lessonsA1.some(l => l.lessonFocus || l.learningPerformances.length > 0);

  const getNavClass = (isActive: boolean, isDisabled: boolean) => 
    `flex items-center justify-between p-4 rounded-xl transition-all ${
      isDisabled 
        ? 'opacity-40 cursor-not-allowed text-gray-400'
        : isActive 
          ? 'glass font-bold text-indigo-600 bg-white/40 shadow-sm' 
          : 'hover:bg-white/50 text-gray-600'
    }`;

  return (
    <div className="sidebar glass-panel shadow-2xl z-10 p-6 flex flex-col justify-between h-screen sticky top-0">
      <div>
        <div className="flex items-center gap-3 mb-10 mt-2 px-2">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-emerald-400 flex items-center justify-center text-white font-bold text-xl shadow-lg">資</div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-emerald-600 mb-0">資優課程規劃</h1>
        </div>
        
        <nav className="flex flex-col gap-3">
          <NavLink to="/settings" className={({ isActive }) => getNavClass(isActive, false)}>
            <div className="flex items-center gap-4">
              <SettingsIcon size={20} />
              <span>基本設定</span>
            </div>
          </NavLink>

          <NavLink 
            to={isBasicSettingsDone ? "/planning" : "#"} 
            onClick={(e) => !isBasicSettingsDone && e.preventDefault()}
            className={({ isActive }) => getNavClass(isActive, !isBasicSettingsDone)}
          >
            <div className="flex items-center gap-4">
              <Calendar size={20} />
              <span>課程規劃</span>
            </div>
            {!isBasicSettingsDone && <Lock size={14} className="text-gray-400" />}
          </NavLink>

          <NavLink 
            to={isPlanningDone ? "/igp" : "#"} 
            onClick={(e) => !isPlanningDone && e.preventDefault()}
            className={({ isActive }) => getNavClass(isActive, !isPlanningDone)}
          >
            <div className="flex items-center gap-4">
              <FileEdit size={20} />
              <span>IGP 個別調整</span>
            </div>
            {!isPlanningDone && <Lock size={14} className="text-gray-400" />}
          </NavLink>
        </nav>
      </div>
      
      <div className="text-[10px] text-center text-gray-400 p-2 border-t border-white/20">
        Kaohsiung Gifted Curriculum System<br/>v1.1.0 · 行政流程優化版
      </div>
    </div>
  );
};

const Layout = () => {
  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content relative pb-20">
        <div className="max-w-5xl mx-auto animate-fade-in relative z-10">
          <Routes>
            <Route path="/" element={<Navigate to="/settings" replace />} />
            <Route path="/settings" element={<BasicSettings />} />
            <Route path="/planning" element={<CurriculumPlan />} />
            <Route path="/igp" element={<IgpAdjustments />} />
          </Routes>
        </div>
        
        {/* Decorative Background Elements */}
        <div className="fixed top-[-10%] right-[-5%] w-[40vw] h-[40vw] rounded-full bg-indigo-300/20 blur-[100px] pointer-events-none z-0"></div>
        <div className="fixed bottom-[-10%] left-[20%] w-[30vw] h-[30vw] rounded-full bg-emerald-300/20 blur-[80px] pointer-events-none z-0"></div>
      </main>
    </div>
  );
};

function App() {
  return (
    <AppProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Layout />
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
