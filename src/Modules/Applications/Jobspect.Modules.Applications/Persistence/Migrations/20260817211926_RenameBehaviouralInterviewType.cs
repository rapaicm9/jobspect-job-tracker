using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jobspect.Modules.Applications.Persistence.Migrations
{
    /// <summary>
    /// Data only, which is why it scaffolded empty: the column is the same
    /// varchar it was and what changed is the set of names allowed in it. An
    /// interview type is stored as its member name, so a row written before this
    /// holds a name the enum no longer has and would throw on the way back out.
    /// </summary>
    public partial class RenameBehaviouralInterviewType : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                "UPDATE applications.interviews SET type = 'HrInterview' WHERE type = 'Behavioural';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                "UPDATE applications.interviews SET type = 'Behavioural' WHERE type = 'HrInterview';");
        }
    }
}
