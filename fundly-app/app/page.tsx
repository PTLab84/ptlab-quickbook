'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function FundlyHome() {
  // Added 'balances' to our tabs
  const [activeTab, setActiveTab] = useState<'simulator' | 'rules' | 'balances' | 'history'>('simulator');
  const [income, setIncome] = useState('');
  const [rules, setRules] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [newRuleLabel, setNewRuleLabel] = useState('');
  const [newRulePercentage, setNewRulePercentage] = useState('');
  const [newRuleType, setNewRuleType] = useState('bank');

  const fetchData = async () => {
    const { data: rulesData } = await supabase.from('routing_rules').select('*').order('created_at', { ascending: true });
    if (rulesData) setRules(rulesData);

    const { data: txData } = await supabase.from('transactions').select('*').order('created_at', { ascending: false });
    if (txData) setTransactions(txData);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const totalPercentage = rules.reduce((sum, rule) => sum + Number(rule.percentage), 0);

  // --- CALCULATE BALANCES ON THE FLY ---
  const getBalances = () => {
    const totals: Record<string, { amount: number, type: string }> = {};
    
    transactions.forEach(tx => {
      tx.split_details.forEach((split: any) => {
        if (!totals[split.label]) {
          totals[split.label] = { amount: 0, type: split.type };
        }
        totals[split.label].amount += parseFloat(split.amount);
      });
    });

    return Object.entries(totals).map(([label, data]) => ({
      label,
      amount: data.amount.toFixed(2),
      type: data.type
    }));
  };

  const accountBalances = getBalances();
  const totalSystemBalance = accountBalances.reduce((sum, acc) => sum + parseFloat(acc.amount), 0).toFixed(2);

  // --- ACTIONS ---

  const addRule = async () => {
    if (!newRuleLabel || !newRulePercentage) return;
    setIsLoading(true);
    await supabase.from('routing_rules').insert({
      label: newRuleLabel,
      percentage: parseFloat(newRulePercentage),
      account_type: newRuleType
    });
    setNewRuleLabel('');
    setNewRulePercentage('');
    await fetchData();
    setIsLoading(false);
  };

  const deleteRule = async (id: string) => {
    await supabase.from('routing_rules').delete().eq('id', id);
    await fetchData();
  };

  const runRoutingEngine = async () => {
    setIsLoading(true);
    const amount = parseFloat(income);
    
    const calculatedSplits = rules.map(rule => ({
      label: rule.label,
      amount: (amount * (rule.percentage / 100)).toFixed(2),
      type: rule.account_type
    }));

    await supabase.from('transactions').insert({
      total_amount: amount,
      description: 'Routed Income',
      split_details: calculatedSplits
    });

    setResults(calculatedSplits);
    await fetchData(); 
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      {/* Navigation */}
      <nav className="p-6 max-w-6xl mx-auto flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">F</div>
          <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-emerald-500">Fundly</span>
        </div>
      </nav>

      {/* TABS */}
      <div className="max-w-4xl mx-auto px-4 mb-8 flex justify-center">
        <div className="bg-slate-200 p-1 rounded-xl flex w-full md:w-auto shadow-inner overflow-x-auto snap-x">
          <button onClick={() => setActiveTab('simulator')} className={`snap-center flex-1 md:px-6 py-3 whitespace-nowrap rounded-lg font-bold transition-all ${activeTab === 'simulator' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
            Simulator 🚀
          </button>
          <button onClick={() => setActiveTab('rules')} className={`snap-center flex-1 md:px-6 py-3 whitespace-nowrap rounded-lg font-bold transition-all ${activeTab === 'rules' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
            Rules ⚙️
          </button>
          <button onClick={() => setActiveTab('balances')} className={`snap-center flex-1 md:px-6 py-3 whitespace-nowrap rounded-lg font-bold transition-all ${activeTab === 'balances' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
            Balances 🏦
          </button>
          <button onClick={() => setActiveTab('history')} className={`snap-center flex-1 md:px-6 py-3 whitespace-nowrap rounded-lg font-bold transition-all ${activeTab === 'history' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
            History 📜
          </button>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 md:px-8">
        
        {/* --- SIMULATOR TAB --- */}
        {activeTab === 'simulator' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start animate-in fade-in duration-500">
            <section className="bg-white p-8 rounded-3xl shadow-xl shadow-indigo-100 border border-indigo-50">
              <h1 className="text-2xl font-bold mb-2">Income Filter</h1>
              <p className="text-slate-500 mb-8 text-sm">Enter any amount to route it based on your rules.</p>
              
              <div className="relative mb-6">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-slate-400">$</span>
                <input 
                  type="number" placeholder="0.00" 
                  className="w-full pl-10 pr-4 py-5 bg-slate-100 rounded-2xl text-3xl font-bold focus:ring-4 focus:ring-indigo-500/20 outline-none transition-all"
                  value={income} onChange={(e) => setIncome(e.target.value)}
                />
              </div>
              
              <button 
                onClick={runRoutingEngine} disabled={isLoading || !income || rules.length === 0}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold py-5 rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2"
              >
                {rules.length === 0 ? "Add Rules First" : isLoading ? "Routing..." : "Process Income"}
              </button>
            </section>

            <section className="space-y-4">
              <h2 className="text-lg font-bold px-2 text-slate-700">Live Distribution</h2>
              {results.length > 0 ? (
                results.map((res, i) => (
                  <div key={i} className="bg-white p-5 rounded-2xl flex justify-between items-center shadow-sm border-l-4 border-emerald-500">
                    <div>
                      <p className="font-bold text-slate-800">{res.label}</p>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{res.type}</p>
                    </div>
                    <p className="text-xl font-bold text-emerald-600">${res.amount}</p>
                  </div>
                ))
              ) : (
                <div className="bg-indigo-50/50 border-2 border-dashed border-indigo-100 rounded-3xl p-12 text-center">
                  <p className="text-indigo-400 italic text-sm">Waiting for incoming funds...</p>
                </div>
              )}
            </section>
          </div>
        )}

        {/* --- RULES MANAGER TAB --- */}
        {activeTab === 'rules' && (
          <div className="bg-white p-6 md:p-8 rounded-3xl shadow-xl shadow-indigo-100 border border-indigo-50 animate-in fade-in duration-500">
            <div className="flex justify-between items-end mb-8 border-b border-slate-100 pb-6">
              <div>
                <h1 className="text-2xl font-bold text-slate-800">Your Routing Rules</h1>
                <p className="text-slate-500 text-sm mt-1">Define exactly where your money goes.</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Total Allocated</p>
                <p className={`text-2xl font-bold ${totalPercentage === 100 ? 'text-emerald-500' : totalPercentage > 100 ? 'text-red-500' : 'text-indigo-600'}`}>{totalPercentage}%</p>
              </div>
            </div>

            <div className="space-y-3 mb-8">
              {rules.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center font-bold text-lg">{rule.percentage}%</div>
                    <div>
                      <p className="font-bold text-slate-700">{rule.label}</p>
                      <p className="text-xs text-slate-400 uppercase font-bold">{rule.account_type}</p>
                    </div>
                  </div>
                  <button onClick={() => deleteRule(rule.id)} className="text-red-400 hover:text-red-600 font-bold px-4 py-2 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">Delete</button>
                </div>
              ))}
            </div>

            <div className="bg-slate-100 p-6 rounded-2xl">
              <h3 className="font-bold text-slate-700 mb-4">Add New Destination</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <input type="text" placeholder="e.g. Tax Account" value={newRuleLabel} onChange={(e) => setNewRuleLabel(e.target.value)} className="p-3 rounded-xl border-none focus:ring-2 focus:ring-indigo-500 outline-none"/>
                <div className="relative">
                  <input type="number" placeholder="Percentage (e.g. 20)" value={newRulePercentage} onChange={(e) => setNewRulePercentage(e.target.value)} className="w-full p-3 rounded-xl border-none focus:ring-2 focus:ring-indigo-500 outline-none"/>
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">%</span>
                </div>
                <select value={newRuleType} onChange={(e) => setNewRuleType(e.target.value)} className="p-3 rounded-xl border-none focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-600 font-medium">
                  <option value="bank">Everyday Bank</option>
                  <option value="savings">Savings Account</option>
                  <option value="investment">Investment / Broker</option>
                  <option value="tax">Tax / Compliance</option>
                </select>
              </div>
              <button onClick={addRule} disabled={!newRuleLabel || !newRulePercentage || isLoading} className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white font-bold py-3 rounded-xl transition-all">
                {isLoading ? "Saving..." : "+ Add Rule"}
              </button>
            </div>
          </div>
        )}

        {/* --- BALANCES TAB --- */}
        {activeTab === 'balances' && (
          <div className="bg-white p-6 md:p-8 rounded-3xl shadow-xl shadow-indigo-100 border border-indigo-50 animate-in fade-in duration-500">
            <div className="mb-8 pb-6 border-b border-slate-100 flex justify-between items-end">
              <div>
                <h1 className="text-2xl font-bold text-slate-800">Account Balances</h1>
                <p className="text-slate-500 text-sm mt-1">Total accumulated funds across all your destinations.</p>
              </div>
              <div className="text-right">
                 <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Total System Funds</p>
                 <p className="text-3xl font-bold text-indigo-600">${totalSystemBalance}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {accountBalances.length > 0 ? accountBalances.map((acc, idx) => (
                <div key={idx} className="bg-slate-50 p-6 rounded-2xl border border-slate-200 hover:border-indigo-300 transition-colors">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold text-slate-700 text-lg">{acc.label}</h3>
                    <span className="bg-white border border-slate-200 text-slate-500 text-[10px] uppercase font-bold px-3 py-1 rounded-full shadow-sm">{acc.type}</span>
                  </div>
                  <p className="text-4xl font-black text-emerald-600 mt-4">${acc.amount}</p>
                </div>
              )) : (
                <div className="col-span-full bg-indigo-50/50 border-2 border-dashed border-indigo-100 rounded-3xl p-12 text-center">
                  <p className="text-indigo-400 italic text-sm">No funds routed yet. Head to the simulator to process some income!</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- HISTORY TAB --- */}
        {activeTab === 'history' && (
          <div className="bg-white p-6 md:p-8 rounded-3xl shadow-xl shadow-indigo-100 border border-indigo-50 animate-in fade-in duration-500">
             <h1 className="text-2xl font-bold text-slate-800 mb-6">Transaction Ledger</h1>
             
             <div className="space-y-6">
               {transactions.length > 0 ? transactions.map((tx) => (
                 <div key={tx.id} className="border border-slate-100 rounded-2xl p-5 shadow-sm">
                   <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-4">
                     <div>
                       <p className="font-bold text-slate-800 text-lg">Routed: ${tx.total_amount}</p>
                       <p className="text-xs text-slate-400">{new Date(tx.created_at).toLocaleString()}</p>
                     </div>
                     <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full">Success</span>
                   </div>
                   
                   <div className="grid grid-cols-2 gap-3">
                     {tx.split_details.map((split: any, idx: number) => (
                       <div key={idx} className="bg-slate-50 p-3 rounded-lg flex justify-between items-center">
                         <span className="text-sm font-medium text-slate-600">{split.label}</span>
                         <span className="text-sm font-bold text-emerald-600">${split.amount}</span>
                       </div>
                     ))}
                   </div>
                 </div>
               )) : (
                 <p className="text-center text-slate-400 italic py-10">No transactions recorded yet.</p>
               )}
             </div>
          </div>
        )}
      </main>
    </div>
  );
}