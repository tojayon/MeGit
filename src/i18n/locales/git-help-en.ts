import type zh from './git-help-zh-CN';
import type { LocaleResource } from '../types';

export default {
  about: 'About {{name}}',
  topics: {
    commitActions: {
      title: 'Commit point actions',
      meaning:
        'A commit marker represents a recorded version. Select it to start a new line of development at that exact version, review its changes, or copy its ID.',
      effect:
        'Opening the panel, viewing differences, and copying the ID only read information. Creating a branch requires a name and confirmation and keeps your current branch and files by default.',
    },
    createFromCommit: {
      title: 'New branch from this commit',
      meaning:
        'Create a local line of development at the selected full commit ID. The starting version stays fixed even if the original branch moves forward.',
      effect:
        'Enter a name and confirm to create it. Your current code and uncommitted edits are kept by default. “Switch after creation” changes file versions and requires resolving edits first. Creation does not contact a remote or push.',
    },
    copyCommit: {
      title: 'Copy full commit ID',
      meaning:
        'The full ID identifies this historical version precisely for development notes, issue reports, or other Git tools.',
      effect:
        'Copies only the ID, without the repository path, and does not change branches or files. If copying fails, the panel provides the ID for manual copying.',
    },
    branchTree: {
      title: 'Branch growth tree',
      meaning:
        'The tree grows upwards: dots are commits, and a solid square (HEAD) marks the current checkout. The comparison trunk is your selected comparison branch and is three times as thick as a twig. Green curves show actual merges with multiple parent commits. Rounded rectangles label branches; +X means X consecutive commits are collapsed in that segment.',
      effect:
        'Select a commit marker to open its actions; select a branch label to explore its development. Hover or focus a label for its full name and meaning; select +X to magnify a segment and explore individual commits. Scroll vertically with the wheel, zoom with Ctrl + wheel or trackpad pinch, and move horizontally with Shift + wheel. Hold the right mouse button and drag to pan freely. Change the comparison trunk or expand consecutive commits from the top-right tools menu. Changing the trunk and comparing only read history; they do not switch code, contact a remote or edit files.',
    },
    branchLabel: {
      title: 'Branch name label',
      meaning:
        'A rounded rectangle labels a branch and marks the latest commit it currently points to. Multiple labels at one commit mean those branches currently point to the same version.',
      effect:
        'Select a label for branch details. The buttons to its right compare with the trunk or show the latest commit’s changes without switching branches. Remote labels show locally cached records that Fetch updates. Hover or focus a shortened label to read its full name.',
    },
    collapsedCommits: {
      title: 'Collapsed consecutive commits',
      meaning:
        '+X counts consecutive commits hidden to keep the map compact. It does not count changed files, unpushed commits or pending merges. Collapsing never deletes or modifies commits.',
      effect:
        'Select +X to open a local history that scrolls independently. Select a marker for the same actions as on the main map, including viewing its changes. Escape or an outside click closes the view without moving or zooming the main map. The top-right tools can still expand consecutive commits across the map.',
    },
    treeComparison: {
      title: 'Compare in tree',
      meaning:
        'Compare the selected branch with the trunk and count commits unique to each side. Unique means absent from the other history; it does not imply different files or tested features.',
      effect:
        'Counts use the full locally available history. Only loaded unique commits are highlighted, and closing the panel clears the highlights. Unrelated histories remain separate, and shallow history is explicitly identified.',
    },
    repository: {
      title: 'Repository information',
      meaning:
        'A repository is a local folder whose file versions are recorded by Git. Find its path, current commit, remote names, and check times here.',
      effect:
        'Viewing information does not edit files or contact a remote. Actions in the worktree and branch views change the corresponding Git state.',
    },
    branch: {
      title: 'Current branch',
      meaning:
        'A branch names a line of development. You are viewing and editing files on this line, and new commits usually belong to it.',
      effect:
        'Switching branches changes the file versions in your worktree. Detached HEAD means a specific commit is checked out; create a local branch to continue development.',
    },
    head: {
      title: 'Commit ID and HEAD',
      meaning:
        'Each commit has a full ID that identifies one historical version precisely. HEAD points to the commit currently checked out.',
      effect:
        'Short IDs are easier to read; full IDs support exact comparisons. Viewing or copying an ID does not switch branches or edit files.',
    },
    upstream: {
      title: 'Tracking branch',
      meaning:
        'The tracking branch is the remote branch used by your current local branch for default synchronization and comparison, such as origin/main.',
      effect:
        'Ahead and behind counts compare against it. Without a tracking branch, these counts are unknown, and pull and push are unavailable.',
    },
    remotes: {
      title: 'Remotes',
      meaning:
        'A remote names a connection to another Git repository, such as origin. It often points to a shared server, but can also be a local repository.',
      effect:
        'Configuring a remote does not synchronize it. Fetch, pull, or push contacts that repository; this panel lists names without exposing connection credentials.',
    },
    checked: {
      title: 'Last local check',
      meaning: 'This is when MeGit most recently read local file changes and branch state.',
      effect:
        'Refresh checks local state again without fetching new server commits. Check the last fetch time to assess how recent the remote records are.',
    },
    fetched: {
      title: 'Last fetch time',
      meaning:
        'This is when Git last wrote a fetch record, which helps you judge whether locally stored remote information may be outdated.',
      effect:
        'It does not prove every remote is synchronized. Use Fetch for updated records; viewing this time does not contact a remote.',
    },
    sync: {
      title: 'Synchronization status',
      meaning:
        'Ahead counts commits present locally but absent from the tracking branch. Behind counts commits present there but absent locally. A dash means the count is unknown.',
      effect:
        'Counts use locally stored remote records and update after Fetch. Both counts can be zero while uncommitted file changes still exist.',
    },
    fetch: {
      title: 'Fetch',
      meaning:
        'Download new commits and branch information from configured remotes, and clean up local records of branches deleted on the remote.',
      effect:
        'Contacts remotes without changing current worktree files, switching branches, or uploading local changes. After success, stale remote labels disappear; local branches and merged commit history remain. Refresh status only reads local state without contacting remotes.',
    },
    pull: {
      title: 'Pull',
      meaning:
        'Fetch new commits from the tracking branch and update the current branch and worktree to a newer version.',
      effect:
        'Contacts the remote and updates files. MeGit only permits fast-forward pulls; it stops for uncommitted changes or diverged history without automatically merging or overwriting changes.',
    },
    push: {
      title: 'Push',
      meaning:
        'Upload commits already recorded on the current branch to its tracked remote branch.',
      effect:
        'Changes the remote repository and can make commits visible to collaborators. Uncommitted files are not uploaded; success does not confirm a build or deployment.',
    },
    worktree: {
      title: 'Worktree',
      meaning:
        'The worktree contains the files you are editing. This view separates unstaged changes from changes selected for the next commit.',
      effect:
        'Review differences, stage the files to record, then enter a message and commit. Staging and committing are local; only pushing uploads commits.',
    },
    history: {
      title: 'Commit history',
      meaning:
        'Each commit is a saved version record. Lines show parent relationships; merge commits can have multiple parents.',
      effect:
        'Select a record to inspect its changes. Viewing history does not revert, switch, or rewrite versions.',
    },
    branches: {
      title: 'Branches',
      meaning:
        'Branches let separate tasks follow their own lines of development. This view separates local branches from locally recorded remote branches.',
      effect:
        'Create, switch, or safely delete local branches. Resolve worktree changes before switching; viewing this list does not contact a remote.',
    },
    unstaged: {
      title: 'Worktree changes',
      meaning:
        'These file changes, including new files, have not been selected for the next commit. They remain on your computer.',
      effect:
        'Select a file to review its differences, then Stage it. A file can appear in both staged and worktree lists.',
    },
    staged: {
      title: 'Staged changes',
      meaning:
        'The staging area holds candidate changes for the next commit, using the file versions selected when you staged them.',
      effect:
        'Commit records this content. Later edits need staging again. Unstage removes changes from this list while preserving the edited files.',
    },
    stage: {
      title: 'Stage',
      meaning: 'Put the selected files’ current changes in the staging area for the next commit.',
      effect:
        'Includes all current changes in each selected file, including deletion. It does not create a commit or upload anything; later edits need staging again.',
    },
    unstage: {
      title: 'Unstage',
      meaning: 'Remove selected file changes from the list of changes for the next commit.',
      effect:
        'Files and edits stay in the worktree. Stage them again whenever you want to include them in a commit.',
    },
    commit: {
      title: 'Commit',
      meaning:
        'Save the staging area’s content and your message as a new version record in the local repository.',
      effect:
        'Records staged content only and does not upload it. Describe what changed in the message; use Push later to synchronize with the remote.',
    },
    fileStatus: {
      title: 'File status',
      meaning:
        'M means modified, A added, D deleted, R renamed, and C copied. The letter describes changes in the current list.',
      effect:
        'Select the file name to review differences. Staged and worktree changes are compared separately, so a file may have different statuses in each list.',
    },
    untracked: {
      title: 'Untracked file',
      meaning:
        'U marks a new file or directory that Git has not recorded yet. It currently exists only in the worktree.',
      effect:
        'Stage and commit it to start recording its versions. Review its contents for passwords, keys, or other information that should not enter version history.',
    },
    conflict: {
      title: 'File conflict',
      meaning:
        'Git cannot automatically decide which changes to keep in this file. You need to review and resolve them.',
      effect:
        'Confirm the final content in your editor, then stage it to mark the conflict resolved. MeGit does not choose a side or resolve conflicts for you.',
    },
    workingDiff: {
      title: 'Worktree differences',
      meaning:
        'Compare current files with the staging area. Untracked files show their current text. Plus signs mark added lines and minus signs mark removed lines.',
      effect:
        'Viewing does not edit files. This contains unstaged changes only; open a file from the staged list to review the next commit’s content.',
    },
    stagedDiff: {
      title: 'Staged differences',
      meaning:
        'Compare the staging area with the current commit to review what the next commit will record. Plus signs mark added lines and minus signs mark removed lines.',
      effect:
        'Viewing does not edit files. Edits made after staging are absent until you stage them again.',
    },
    commitDiff: {
      title: 'Commit differences',
      meaning:
        'Review a commit’s changes relative to its parent. Merge commits are compared with their first parent. Plus signs mark added lines; minus signs mark removed lines.',
      effect:
        'Viewing history does not revert or overwrite current files. Binary files cannot show line differences; large differences are explicitly marked when truncated.',
    },
    localBranches: {
      title: 'Local branches',
      meaning:
        'These branches are stored on this computer and can be checked out for development. Current marks the one you are using.',
      effect:
        'Creating and safely deleting branches affects local branches only. Branches used by another worktree cannot be switched to or deleted here.',
    },
    remoteBranches: {
      title: 'Remote branches',
      meaning:
        'These are locally stored records of remote branches, such as origin/main, rather than live server results.',
      effect:
        'Fetch to update these records. Create a local tracking branch from one to edit locally, then commit and push.',
    },
    createBranch: {
      title: 'New branch',
      meaning:
        'Create a local line of development at the current commit or a selected branch’s commit. The starting point determines its initial version.',
      effect:
        'Creating alone does not change files. Checking “Switch after creation” changes the worktree and requires resolving uncommitted changes first. Creation does not contact a remote.',
    },
    switchBranch: {
      title: 'Switch branch',
      meaning:
        'Move the current development position and worktree files to the selected local branch.',
      effect:
        'Changes file versions. MeGit requires committing or resolving edits first and protects untracked and ignored files without automatically stashing edits.',
    },
    deleteBranch: {
      title: 'Delete local branch',
      meaning:
        'Remove a local branch name only when its commits are already included in the current commit.',
      effect:
        'Keeps remote branches and repository files. The current branch and branches used by another worktree are protected. Board Undo cannot restore Git actions.',
    },
    tracking: {
      title: 'Track remote branch',
      meaning:
        'Create a local branch from a cached remote record and optionally use that remote branch as its default synchronization target.',
      effect:
        'Tracking makes ahead and behind counts compare against it. Creation is local; fetch first if you need a more recent starting point.',
    },
    integration: {
      title: 'Code integration',
      meaning:
        'Check whether the target reference’s history contains the source reference’s commit. The arrow sets the source-to-target comparison direction.',
      effect:
        'The connection reads and compares Git evidence without merging code. Included does not confirm testing or deployment; reasons for unknown results remain visible.',
    },
    comparison: {
      title: 'Comparison basis',
      meaning:
        'A reference can be a branch name or commit ID. MeGit resolves source and target references to commits, then checks their parent history for inclusion.',
      effect:
        'Pending counts source commits absent from the target. Cherry-picked, squashed, or rewritten history requires manual review rather than being assumed included.',
    },
    dependency: {
      title: 'Development dependency',
      meaning:
        'Record your own development order or dependency direction between repositories to organize the board.',
      effect:
        'The relation does not install dependencies, run tasks, or confirm code integration. Editing it does not change repository files.',
    },
    delivery: {
      title: 'Delivery relation',
      meaning:
        'Record your own build or delivery direction to express the workflow between repositories.',
      effect:
        'Build and deployment services are not connected yet. This relation does not publish a product or confirm the version running online.',
    },
  },
} satisfies LocaleResource<typeof zh>;
