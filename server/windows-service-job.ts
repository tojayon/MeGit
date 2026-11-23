export const windowsJobSource = String.raw`
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class MeGitService {
  [StructLayout(LayoutKind.Sequential)] struct Info {
    public long ProcessTime, JobTime;
    public uint Flags;
    public UIntPtr Minimum, Maximum;
    public uint Limit;
    public UIntPtr Affinity;
    public uint Priority, Scheduling;
  }
  [StructLayout(LayoutKind.Sequential)] struct Limits {
    public Info Basic;
    public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes;
    public UIntPtr ProcessMemory, JobMemory, PeakProcess, PeakJob;
  }
  [StructLayout(LayoutKind.Sequential)] struct Accounting {
    public long User, Kernel, PeriodUser, PeriodKernel;
    public uint Faults, Total, Active, Terminated;
  }
  [StructLayout(LayoutKind.Sequential)] struct Startup {
    public int Size;
    public IntPtr Reserved, Desktop, Title;
    public int X, Y, XSize, YSize, XCount, YCount, Fill, Flags;
    public short Show, ReservedSize;
    public IntPtr ReservedData, Input, Output, Error;
  }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo {
    public IntPtr Handle, Thread;
    public uint Pid, Tid;
  }
  [StructLayout(LayoutKind.Sequential)] struct StartupEx {
    public Startup Standard;
    public IntPtr Attributes;
  }
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int kind, ref Limits limits, int size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job, int kind, out Accounting info, int size, IntPtr returned);
  [DllImport("kernel32.dll")] static extern bool TerminateJobObject(IntPtr job, uint code);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool member);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int index);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr previousSize);
  [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool CreateProcess(string file, StringBuilder args, IntPtr processAttributes, IntPtr threadAttributes, bool inherit, uint flags, IntPtr env, string cwd, ref StartupEx startup, out ProcessInfo process);
  [DllImport("iphlpapi.dll")] static extern uint GetExtendedTcpTable(IntPtr buffer, ref int size, bool sorted, int family, int table, uint reserved);

  static void Require(bool success) { if (!success) throw new Win32Exception(); }

  static int Active(IntPtr job) {
    Accounting info;
    Require(QueryInformationJobObject(job, 1, out info, Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero));
    return (int)info.Active;
  }

  static void Listeners(HashSet<int> owners, int port, int family) {
    int size = 0;
    for (int attempt = 0; attempt < 5; ++attempt) {
      IntPtr table = size == 0 ? IntPtr.Zero : Marshal.AllocHGlobal(size);
      try {
        uint result = GetExtendedTcpTable(table, ref size, false, family, 3, 0);
        if (result == 122) continue;
        if (result != 0) throw new Win32Exception((int)result);
        if (table == IntPtr.Zero) return;
        int count = Marshal.ReadInt32(table);
        int width = family == 2 ? 24 : 56;
        for (int index = 0; index < count; ++index) {
          int row = 4 + index * width;
          int field = row + (family == 2 ? 8 : 20);
          if ((Marshal.ReadByte(table, field) * 256 + Marshal.ReadByte(table, field + 1)) == port)
            owners.Add(Marshal.ReadInt32(table, row + width - 4));
        }
        return;
      } finally { if (table != IntPtr.Zero) Marshal.FreeHGlobal(table); }
    }
    throw new InvalidOperationException();
  }

  static HashSet<int> Listeners(int port) {
    var owners = new HashSet<int>();
    if (port != 0) { Listeners(owners, port, 2); Listeners(owners, port, 23); }
    return owners;
  }

  static bool Owns(IntPtr job, int pid) {
    IntPtr handle = OpenProcess(0x1000, false, pid);
    if (handle == IntPtr.Zero) return false;
    try { bool member; return IsProcessInJob(handle, job, out member) && member; }
    finally { CloseHandle(handle); }
  }

  static string Take(string key) {
    string value = Environment.GetEnvironmentVariable("MEGIT_CHILD_" + key);
    Environment.SetEnvironmentVariable("MEGIT_CHILD_" + key, null);
    return value;
  }

  static void Launch(IntPtr job, string file, string args, string cwd) {
    var size = IntPtr.Zero;
    InitializeProcThreadAttributeList(IntPtr.Zero, 2, 0, ref size);
    if (size == IntPtr.Zero) throw new Win32Exception();
    IntPtr attributes = Marshal.AllocHGlobal(size);
    IntPtr values = Marshal.AllocHGlobal(IntPtr.Size * 2);
    try {
      Require(InitializeProcThreadAttributeList(attributes, 2, 0, ref size));
      try {
        IntPtr output = GetStdHandle(-12);
        Marshal.WriteIntPtr(values, job);
        IntPtr inherited = IntPtr.Add(values, IntPtr.Size);
        Marshal.WriteIntPtr(inherited, output);
        Require(UpdateProcThreadAttribute(attributes, 0, new IntPtr(0x2000D), values, new IntPtr(IntPtr.Size), IntPtr.Zero, IntPtr.Zero));
        Require(UpdateProcThreadAttribute(attributes, 0, new IntPtr(0x20002), inherited, new IntPtr(IntPtr.Size), IntPtr.Zero, IntPtr.Zero));
        var startup = new StartupEx();
        startup.Standard.Size = Marshal.SizeOf(typeof(StartupEx));
        startup.Standard.Flags = 0x100;
        startup.Standard.Output = startup.Standard.Error = output;
        startup.Attributes = attributes;
        ProcessInfo process;
        Require(CreateProcess(file, new StringBuilder(args), IntPtr.Zero, IntPtr.Zero, true, 0x08080000, IntPtr.Zero, cwd, ref startup, out process));
        CloseHandle(process.Thread);
        CloseHandle(process.Handle);
      } finally { DeleteProcThreadAttributeList(attributes); }
    } finally {
      Marshal.FreeHGlobal(values);
      Marshal.FreeHGlobal(attributes);
    }
  }

  public static void Run() {
    string file = Take("FILE"), args = Take("ARGS"), cwd = Take("CWD"), key = Take("KEY");
    int port = Int32.Parse(Take("PORT"));
    using (var mutex = new Mutex(false, "Local\\MeGitService-" + key)) {
      try { if (!mutex.WaitOne(0)) { Console.WriteLine("duplicate"); return; } }
      catch (AbandonedMutexException) { }
      try { Monitor(file, args, cwd, port); }
      finally { mutex.ReleaseMutex(); }
    }
  }

  static void Monitor(string file, string args, string cwd, int port) {
    var stop = new ManualResetEvent(false);
    var thread = new Thread(() => {
      try { Console.OpenStandardInput().ReadByte(); }
      catch (System.IO.IOException) { }
      finally { stop.Set(); }
    });
    thread.IsBackground = true;
    thread.Start();
    for (int attempt = 0; ; ++attempt) {
      int? owner = null;
      foreach (int pid in Listeners(port)) { owner = pid; break; }
      if (!owner.HasValue) break;
      if (attempt == 4) { Console.WriteLine("busy " + owner.Value); return; }
      if (stop.WaitOne(150)) return;
    }
    if (stop.WaitOne(0)) return;
    IntPtr job = CreateJobObject(IntPtr.Zero, null);
    Require(job != IntPtr.Zero);
    try {
      var limits = new Limits();
      limits.Basic.Flags = 0x2000;
      Require(SetInformationJobObject(job, 9, ref limits, Marshal.SizeOf(typeof(Limits))));
      if (stop.WaitOne(0)) return;
      Launch(job, file, args, cwd);
      var wait = Stopwatch.StartNew();
      bool running = false;
      while (!stop.WaitOne(150)) {
        if (Active(job) == 0) { Console.WriteLine("exit"); return; }
        bool ready = port == 0;
        foreach (int pid in Listeners(port)) {
          if (Owns(job, pid)) ready = true;
          else { Console.WriteLine("busy " + pid); return; }
        }
        if (ready != running) {
          Console.WriteLine(ready ? "running" : "starting");
          running = ready;
          wait.Restart();
        }
        if (!ready && wait.ElapsedMilliseconds > 30000) { Console.WriteLine("timeout"); return; }
      }
    } finally {
      try {
        if (TerminateJobObject(job, 1)) {
          var deadline = Stopwatch.StartNew();
          while (deadline.ElapsedMilliseconds < 4500 && Active(job) != 0) Thread.Sleep(30);
        }
      } finally { CloseHandle(job); }
    }
  }
}
`;
