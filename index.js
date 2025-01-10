#!/usr/bin/env node
import {
	intro,
	outro,
	confirm,
	multiselect,
	spinner,
	isCancel,
	cancel,
	text,
	select,
} from '@clack/prompts';
import color from 'picocolors';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadTemplate(filename) {
	return fs.readFileSync(
		path.join(__dirname, 'templates', filename),
		'utf-8'
	);
}

async function initGitAndCommit(projectPath) {
	try {
		await execAsync('git init', { cwd: projectPath });
		await execAsync('git add .', { cwd: projectPath });
		await execAsync('git commit -m "Initial commit"', { cwd: projectPath });
		return true;
	} catch (error) {
		console.error(color.red('Error initializing git:'), error.message);
		return false;
	}
}

async function createGithubRepo(projectPath, projectName, isPublic) {
	try {
		const visibility = isPublic ? 'public' : 'private';
		await execAsync(`cd ${projectPath} && gh repo create ${projectName} --${visibility} --source=. --remote=origin --push`);
		return true;
	} catch (error) {
		console.error(color.red('Error creating GitHub repository:'), error.message);
		return false;
	}
}

async function checkGhCliInstalled() {
	try {
		await execAsync('gh --version');
		return true;
	} catch (error) {
		return false;
	}
}

async function createProjectStructure(projectName, features) {
	// Create project directory and src directory only
	fs.mkdirSync(projectName);
	fs.mkdirSync(path.join(projectName, 'src'));
	if (features.includes('tests')) {
		fs.mkdirSync(path.join(projectName, 'tests'));
	}

	// Create project files
	fs.writeFileSync(
		path.join(projectName, 'Makefile'),
		loadTemplate('Makefile')
	);

	fs.writeFileSync(
		path.join(projectName, 'src', 'main.c'),
		loadTemplate('main.c')
	);

	if (features.includes('gitignore')) {
		fs.writeFileSync(
			path.join(projectName, '.gitignore'),
			loadTemplate('.gitignore')
		);
	}
}

async function main() {
	intro(color.inverse(' create-c-project '));

	const projectName = await text({
		message: 'What is your project name?',
		placeholder: 'my-c-project',
		validate: (value) => {
			if (value.length === 0) return 'Project name is required!';
			if (fs.existsSync(value)) return 'Directory already exists!';
			if (!/^[a-zA-Z0-9-_]+$/.test(value)) return 'Invalid project name!';
		},
	});

	if (isCancel(projectName)) {
		cancel('Operation cancelled');
		return process.exit(0);
	}

	const features = await multiselect({
		message: 'Select project features',
		options: [
			{ value: 'gitignore', label: 'Add .gitignore', hint: 'Recommended' },
			{ value: 'readme', label: 'Add README.md' },
			{ value: 'tests', label: 'Add tests directory' },
		],
	});

	if (isCancel(features)) {
		cancel('Operation cancelled');
		return process.exit(0);
	}

	let projectDescription = '';
	if (features.includes('readme')) {
		projectDescription = await text({
			message: 'Enter a short project description:',
			placeholder: 'A C project created with create-c-project',
		});

		if (isCancel(projectDescription)) {
			cancel('Operation cancelled');
			return process.exit(0);
		}
	}

	const shouldInitGit = await confirm({
		message: 'Initialize Git repository?',
	});

	if (isCancel(shouldInitGit)) {
		cancel('Operation cancelled');
		return process.exit(0);
	}

	let shouldCreateGithubRepo = false;
	let isPublicRepo = false;

	if (shouldInitGit) {
		const ghInstalled = await checkGhCliInstalled();

		if (ghInstalled) {
			shouldCreateGithubRepo = await confirm({
				message: 'Create GitHub repository? (requires gh CLI)',
			});

			if (isCancel(shouldCreateGithubRepo)) {
				cancel('Operation cancelled');
				return process.exit(0);
			}

			if (shouldCreateGithubRepo) {
				const visibility = await select({
					message: 'Repository visibility',
					options: [
						{ value: true, label: 'Public' },
						{ value: false, label: 'Private' },
					],
				});

				if (isCancel(visibility)) {
					cancel('Operation cancelled');
					return process.exit(0);
				}

				isPublicRepo = visibility;
			}
		}
	}

	const s = spinner();
	try {

		s.start('Creating project...');
		await createProjectStructure(projectName, features);
		s.stop('Project created');

		if (features.includes('readme')) {
			fs.writeFileSync(
				path.join(projectName, 'README.md'),
				`# ${projectName}\n\n${projectDescription}\n`
			);
		}

		if (shouldInitGit) {
			s.start('Initializing git repository...');
			const gitInit = await initGitAndCommit(projectName);
			if (!gitInit) {
				s.stop('Project created (git initialization failed)');
				return;
			}
			s.stop('Repository initialized.');
		}

		if (shouldCreateGithubRepo) {
			s.start('Creating GitHub repository...');
			const repoCreated = await createGithubRepo(projectName, projectName, isPublicRepo);
			if (!repoCreated) {
				s.stop('Project created (GitHub repository creation failed)');
				return;
			}
		}

		s.stop(`Project ${color.green(projectName)} created successfully`);
		outro('Setup completed successfully');
		process.exit(0);

	} catch (error) {
		s.stop('Failed to create project');
		console.error(color.red('Error:'), error.message);
		outro('Setup failed');
		process.exit(1);
	}
}

main().catch(console.error);
