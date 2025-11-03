export const JSON_IMPORT_TEMPLATE = [
    {
        listName: "To Do",
        cards: [
            {
                title: "Implement user authentication",
                description: "Add OAuth2 login with Google and GitHub providers",
                labels: ["Backend", "High Priority"],
                checklists: [
                    {
                        name: "Implementation Steps",
                        items: [
                            { title: "Set up OAuth providers", completed: false },
                            { title: "Create auth endpoints", completed: false },
                            { title: "Add session management", completed: false },
                        ],
                    },
                ],
            },
            {
                title: "Design landing page",
                description: "Create responsive landing page with hero section",
                labels: ["Frontend", "Design"],
                checklists: [],
            },
            {
                title: "Write API documentation",
                description: "",
                labels: ["Documentation"],
                checklists: [
                    {
                        name: "Documentation Tasks",
                        items: [
                            { title: "Document authentication endpoints", completed: false },
                            { title: "Add code examples", completed: false },
                        ],
                    },
                ],
            },
        ],
    },
    {
        listName: "In Progress",
        cards: [],
    },
];

export const JSON_IMPORT_TEMPLATE_STRING = JSON.stringify(
    JSON_IMPORT_TEMPLATE,
    null,
    2,
);
